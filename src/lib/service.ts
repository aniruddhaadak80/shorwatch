/**
 * The one service layer.
 *
 * Every mutation in the product goes through here: the buttons, the REST routes
 * and the MCP tools all call these functions, so they cannot drift apart. Each
 * mutation appends to the entity's hash chain inside the same call and returns
 * the resulting seal.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { getDb, type SqlClient } from "./db/client";
import { DEMO_OWNER } from "./db/schema";
import { ApiError } from "./errors";
import { evaluateHarvest, type EngineOptions } from "./engine";
import { GENESIS_SEAL, sealEvent, type ChainEvent } from "./integrity/seal";
import { assertSealMatches } from "./session";
import { gatherLive, buildEngineInput, SourceError } from "./sources";
import { DEFAULT_MACHINE, type Decision, type MachineModel } from "./types";
import {
  normaliseDecision,
  normaliseHost,
  normaliseLabel,
  normaliseMachine,
  normaliseNotes,
  normaliseRetentionYears,
} from "./validation";
import type {
  EngineResult,
  KeyObservation,
  Verdict,
  Watch,
  WatchSummary,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

interface WatchRow {
  id: string;
  owner_id: string;
  host: string;
  label: string;
  retention_years: number | string;
  machine: unknown;
  decision: string;
  notes: string;
  live: boolean;
  last_probed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseMachine(raw: unknown): MachineModel {
  if (typeof raw === "string") {
    try {
      return normaliseMachine(JSON.parse(raw));
    } catch {
      return DEFAULT_MACHINE;
    }
  }
  if (raw && typeof raw === "object") return normaliseMachine(raw);
  return DEFAULT_MACHINE;
}

function rowToWatch(row: WatchRow): Watch {
  return {
    id: row.id,
    ownerId: row.owner_id,
    host: row.host,
    label: row.label,
    retentionYears: Number(row.retention_years),
    machine: parseMachine(row.machine),
    decision: row.decision as Decision,
    notes: row.notes,
    live: row.live,
    lastProbedAt: toIso(row.last_probed_at) ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
    deletedAt: toIso(row.deleted_at),
  };
}

const VERDICT_RANK: Record<Verdict, number> = {
  quantum_viable: 0,
  window_closing: 1,
  exposed_before_crq: 2,
  harvestable_now: 3,
};

// ---------------------------------------------------------------------------
// Audit chain
// ---------------------------------------------------------------------------

interface AuditRow {
  seq: number | string;
  action: string;
  at: Date | string;
  payload: unknown;
  prev_seal: string;
  seal: string;
}

async function appendAudit(
  db: SqlClient,
  entityId: string,
  action: string,
  payload: Record<string, unknown>,
  now: Date,
): Promise<string> {
  const rows = await db.query<AuditRow>(
    `SELECT seq, action, at, payload, prev_seal, seal
       FROM audit_events WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
    [entityId],
  );
  const previous = rows[0]?.seal ?? GENESIS_SEAL;
  const seq = Number(rows[0]?.seq ?? 0) + 1;
  const at = now.toISOString();
  const { seal } = sealEvent(previous, { seq, entityId, action, at, payload });

  await db.query(
    `INSERT INTO audit_events (entity_id, seq, action, at, payload, prev_seal, seal)
     VALUES ($1,$2,$3,$4::timestamptz,$5::jsonb,$6,$7)`,
    [entityId, seq, action, at, JSON.stringify(payload), previous, seal],
  );
  return seal;
}

export async function readAudit(
  db: SqlClient,
  entityId: string,
): Promise<Array<ChainEvent & { prevSeal: string; seal: string }>> {
  const rows = await db.query<AuditRow>(
    `SELECT seq, action, at, payload, prev_seal, seal
       FROM audit_events WHERE entity_id = $1 ORDER BY seq ASC`,
    [entityId],
  );
  return rows.map((row) => ({
    seq: Number(row.seq),
    entityId,
    action: row.action,
    at: toIso(row.at) ?? "",
    payload: (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as Record<
      string,
      unknown
    >,
    prevSeal: row.prev_seal,
    seal: row.seal,
  }));
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export async function readIdempotent(
  db: SqlClient,
  ownerId: string,
  endpoint: string,
  key: string,
): Promise<unknown | null> {
  const rows = await db.query<{ result: unknown }>(
    `SELECT result FROM idempotency WHERE key = $1 AND owner_id = $2 AND endpoint = $3`,
    [key, ownerId, endpoint],
  );
  if (!rows[0]) return null;
  return typeof rows[0].result === "string" ? JSON.parse(rows[0].result) : rows[0].result;
}

export async function writeIdempotent(
  db: SqlClient,
  ownerId: string,
  endpoint: string,
  key: string,
  result: unknown,
): Promise<void> {
  await db.query(
    `INSERT INTO idempotency (key, owner_id, endpoint, result)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (key, owner_id, endpoint) DO NOTHING`,
    [key, ownerId, endpoint, JSON.stringify(result)],
  );
}

// ---------------------------------------------------------------------------
// Watches
// ---------------------------------------------------------------------------

export interface CreateWatchInput {
  host: string;
  label?: unknown;
  retentionYears?: unknown;
  machine?: unknown;
}

export interface ProbeResult {
  watch: Watch;
  observation: KeyObservation;
  /** False when the live sources were unreachable and sealed data was kept. */
  probedLive: boolean;
}

async function summarise(db: SqlClient, watchId: string): Promise<WatchSummary | undefined> {
  const rows = await db.query<{
    count: string;
    worst_score: string | null;
    days_to_crq: string | null;
    spki: string | null;
    algorithm: string | null;
    engines: unknown;
  }>(
    `SELECT count(*)::text AS count,
            max((engine->>'score')::double precision) AS worst_score,
            min((engine->>'daysToCrq')::double precision) AS days_to_crq,
            min(spki_sha256) AS spki,
            min(algorithm) AS algorithm,
            json_agg(engine) AS engines
       FROM observations WHERE watch_id = $1`,
    [watchId],
  );
  const row = rows[0];
  if (!row || Number(row.count) === 0) return undefined;

  const engines = (typeof row.engines === "string" ? JSON.parse(row.engines) : row.engines) as
    | EngineResult[]
    | null;
  let worstVerdict: Verdict = "quantum_viable";
  let exposed = 0;
  for (const engine of engines ?? []) {
    if (VERDICT_RANK[engine.verdict] > VERDICT_RANK[worstVerdict]) worstVerdict = engine.verdict;
    if (engine.verdict !== "quantum_viable") exposed += 1;
  }

  return {
    observationCount: Number(row.count),
    worstVerdict,
    worstScore: row.worst_score != null ? Number(row.worst_score) : 0,
    exposedKeyCount: exposed,
    daysToCrq: row.days_to_crq != null ? Number(row.days_to_crq) : null,
    spkiSha256: row.spki ?? null,
    algorithmLabel: row.algorithm ?? null,
  };
}

export async function listWatches(
  ownerId: string,
  options: { limit: number; offset: number; sort: string; direction: "asc" | "desc" },
): Promise<{ watches: Watch[]; total: number }> {
  const db = await getDb();
  const column =
    options.sort === "host"
      ? "w.host"
      : options.sort === "score"
        ? "coalesce((SELECT max((o.engine->>'score')::double precision) FROM observations o WHERE o.watch_id = w.id), 0)"
        : options.sort === "updatedAt"
          ? "w.updated_at"
          : "w.created_at";
  const order = options.direction === "asc" ? "ASC" : "DESC";

  const rows = await db.query<WatchRow>(
    `SELECT w.* FROM watches w
      WHERE w.owner_id = $1 AND w.deleted_at IS NULL
      ORDER BY ${column} ${order}, w.id ASC
      LIMIT $2 OFFSET $3`,
    [ownerId, options.limit, options.offset],
  );
  const countRows = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM watches WHERE owner_id = $1 AND deleted_at IS NULL",
    [ownerId],
  );

  const watches: Watch[] = [];
  for (const row of rows) {
    const watch = rowToWatch(row);
    watch.summary = await summarise(db, watch.id);
    watches.push(watch);
  }
  return { watches, total: Number(countRows[0]?.count ?? "0") };
}

/**
 * The demo workspace is readable by every visitor so the product is useful on
 * first visit, but it is never writable by anyone but its owner.
 */
async function loadWatch(
  ownerId: string,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<Watch> {
  const db = await getDb();
  const rows = await db.query<WatchRow>(
    `SELECT * FROM watches
      WHERE id = $1 AND (owner_id = $2 OR owner_id = $3)`,
    [id, ownerId, DEMO_OWNER],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound(`no watch with id ${id}`);
  if (row.owner_id !== ownerId && !options.includeDeleted) {
    // Reading the shared demo is allowed; it is flagged so the UI hides controls.
    return { ...rowToWatch(row), summary: await summarise(db, row.id) };
  }
  if (row.deleted_at && !options.includeDeleted) {
    throw new ApiError("gone", "this watch has been deleted");
  }
  const watch = rowToWatch(row);
  watch.summary = await summarise(db, watch.id);
  return watch;
}

export async function getWatch(ownerId: string, id: string): Promise<Watch> {
  return loadWatch(ownerId, id);
}

function assertOwned(watch: Watch, ownerId: string): void {
  if (watch.ownerId !== ownerId) {
    throw new ApiError("unauthorized", "this record belongs to another session");
  }
}

export async function createWatch(ownerId: string, input: CreateWatchInput): Promise<ProbeResult> {
  const host = normaliseHost(input.host);
  const label = normaliseLabel(input.label);
  const retentionYears = normaliseRetentionYears(input.retentionYears);
  const machine = normaliseMachine(input.machine);
  const db = await getDb();
  const now = new Date();
  const id = newId("wch");

  await db.query(
    `INSERT INTO watches (id, owner_id, host, label, retention_years, machine, decision, notes, live, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'undecided','',FALSE,$7::timestamptz,$7::timestamptz)`,
    [id, ownerId, host, label, retentionYears, JSON.stringify(machine), now.toISOString()],
  );
  await appendAudit(db, id, "create", { host, label, retentionYears, machine }, now);

  const created = await loadWatch(ownerId, id);
  return probeWatch(ownerId, id, created);
}

/**
 * Measure the host and persist the resulting key observation. The unique index on
 * (watch_id, spki_sha256) means re-probing the same key updates rather than
 * duplicates, so repeated refreshes stay honest.
 */
export async function probeWatch(
  ownerId: string,
  id: string,
  preloaded?: Watch,
): Promise<ProbeResult> {
  const watch = preloaded ?? (await loadWatch(ownerId, id));
  assertOwned(watch, ownerId);
  const db = await getDb();
  const now = new Date();

  try {
    const gathered = await gatherLive(watch.host);
    const engineInput = buildEngineInput(gathered, watch.retentionYears, watch.machine);
    const engineOptions: EngineOptions = { now, sealSeed: `${id}:${gathered.observation.spkiSha256}` };
    const engine = evaluateHarvest(engineInput, engineOptions);

    const observationId = newId("obs");
    await db.query(
      `INSERT INTO observations
         (id, watch_id, owner_id, spki_sha256, certificate_sha256, algorithm, algorithm_oid,
          parameter_oid, parameter_label, bits, nist_level, spki_der, payload, engine, live, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text,$13::jsonb,$14::jsonb,TRUE,$15::timestamptz)
       ON CONFLICT (watch_id, spki_sha256) DO UPDATE SET
         engine = EXCLUDED.engine,
         payload = EXCLUDED.payload,
         live = TRUE,
         created_at = EXCLUDED.created_at`,
      [
        observationId,
        id,
        ownerId,
        gathered.observation.spkiSha256,
        gathered.observation.certificateSha256,
        gathered.observation.key.algorithm,
        gathered.observation.key.algorithmOid,
        gathered.observation.key.parameterOid,
        gathered.observation.key.parameterLabel,
        gathered.observation.key.bits,
        gathered.observation.key.nistLevel,
        "",
        JSON.stringify({
          observation: gathered.observation,
          transparency: gathered.transparency,
          dns: gathered.dns,
          surface: gathered.surface,
        }),
        JSON.stringify(engine),
        now.toISOString(),
      ],
    );

    await db.query(
      `UPDATE watches SET live = TRUE, last_probed_at = $2::timestamptz, updated_at = $2::timestamptz
        WHERE id = $1`,
      [id, now.toISOString()],
    );
    await appendAudit(
      db,
      id,
      "probe",
      {
        spkiSha256: gathered.observation.spkiSha256,
        algorithm: gathered.observation.key.algorithm,
        score: engine.score,
        verdict: engine.verdict,
        seal: engine.seal,
      },
      now,
    );

    const observation = await loadObservation(db, id, gathered.observation.spkiSha256);
    const updated = await loadWatch(ownerId, id);
    return { watch: updated, observation, probedLive: true };
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    await db.query(
      `UPDATE watches SET live = FALSE, last_probed_at = $2::timestamptz, updated_at = $2::timestamptz
        WHERE id = $1`,
      [id, now.toISOString()],
    );
    await appendAudit(db, id, "probe_failed", { reason: error.code, host: watch.host }, now);
    const updated = await loadWatch(ownerId, id);
    return {
      watch: updated,
      observation: {
        id: "",
        watchId: id,
        host: watch.host,
        subjectCommonName: "",
        subjectAlternativeNames: [],
        issuerCommonName: "",
        issuerOrganisation: null,
        notBefore: now.toISOString(),
        notAfter: now.toISOString(),
        serialNumber: "",
        spkiSha256: "",
        certificateSha256: "",
        protocol: null,
        cipher: null,
        key: {
          algorithm: "unknown",
          algorithmOid: "",
          parameterOid: null,
          parameterLabel: null,
          bits: null,
          nistLevel: null,
        },
        hostnameMatched: false,
        source: {
          sourceId: "tls-wire",
          label: "Live TLS handshake",
          url: "https://nodejs.org/api/tls.html",
          status: "fallback",
          fetchedAt: now.toISOString(),
          reason: error.message,
        },
        transparency: null,
        dns: null,
        surface: null,
        engine: {
          engine: "shorwatch-quantum",
          version: "1.0.0",
          score: 0,
          verdict: "window_closing",
          recommendation: `Live measurement failed: ${error.message}`,
          factors: [],
          weights: {},
          crqDate: "unknown",
          overlapDate: now.toISOString().slice(0, 10),
          daysToCrq: 0,
          leadTimeDays: 0,
          quantum: {
            logicalQubitsNeeded: 0,
            physicalQubitsNeeded: 0,
            budgetFraction: 0,
            anchor: "unavailable",
            estimated: false,
          },
          advisor: {
            expectationZ: 0,
            expectationZZ: 0,
            rawSignal: 0,
            adjustment: 0,
            weights: { z: 0, zz: 0, bias: 0 },
            description: "unavailable",
          },
          classicalSecurityBits: 0,
          seal: "",
          evaluatedAt: now.toISOString(),
        },
        createdAt: now.toISOString(),
      },
      probedLive: false,
    };
  }
}

async function loadObservation(
  db: SqlClient,
  watchId: string,
  spkiSha256: string,
): Promise<KeyObservation> {
  const rows = await db.query<{
    id: string;
    payload: unknown;
    engine: unknown;
    created_at: Date | string;
  }>(
    `SELECT id, payload, engine, created_at FROM observations
      WHERE watch_id = $1 AND spki_sha256 = $2 LIMIT 1`,
    [watchId, spkiSha256],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("no observation for this key");
  const payload =
    typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  const engine = typeof row.engine === "string" ? JSON.parse(row.engine) : row.engine;

  return {
    ...(payload.observation as KeyObservation),
    id: row.id,
    watchId,
    transparency: payload.transparency ?? null,
    dns: payload.dns ?? null,
    surface: payload.surface ?? null,
    engine: engine as EngineResult,
    createdAt: toIso(row.created_at) ?? "",
  };
}

export async function listObservations(
  ownerId: string,
  watchId: string,
): Promise<KeyObservation[]> {
  await loadWatch(ownerId, watchId);
  const db = await getDb();
  const rows = await db.query<{
    id: string;
    payload: unknown;
    engine: unknown;
    created_at: Date | string;
  }>(
    `SELECT id, payload, engine, created_at FROM observations
      WHERE watch_id = $1 ORDER BY created_at DESC`,
    [watchId],
  );

  return rows.map((row) => {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    const engine = typeof row.engine === "string" ? JSON.parse(row.engine) : row.engine;
    return {
      ...(payload.observation as KeyObservation),
      id: row.id,
      watchId,
      transparency: payload.transparency ?? null,
      dns: payload.dns ?? null,
      surface: payload.surface ?? null,
      engine: engine as EngineResult,
      createdAt: toIso(row.created_at) ?? "",
    } satisfies KeyObservation;
  });
}

export interface UpdateWatchInput {
  label?: unknown;
  retentionYears?: unknown;
  machine?: unknown;
  notes?: unknown;
}

export async function updateWatch(
  ownerId: string,
  id: string,
  input: UpdateWatchInput,
): Promise<Watch> {
  const watch = await loadWatch(ownerId, id);
  assertOwned(watch, ownerId);
  const db = await getDb();
  const now = new Date();

  const label = input.label === undefined ? watch.label : normaliseLabel(input.label);
  const retentionYears =
    input.retentionYears === undefined
      ? watch.retentionYears
      : normaliseRetentionYears(input.retentionYears);
  const machine = input.machine === undefined ? watch.machine : normaliseMachine(input.machine);
  const notes = input.notes === undefined ? watch.notes : normaliseNotes(input.notes);

  await db.query(
    `UPDATE watches SET label = $2, retention_years = $3, machine = $4::jsonb, notes = $5,
            updated_at = $6::timestamptz
      WHERE id = $1`,
    [id, label, retentionYears, JSON.stringify(machine), notes, now.toISOString()],
  );
  await appendAudit(db, id, "update", { label, retentionYears, machine, notes }, now);
  return loadWatch(ownerId, id);
}

export interface DecideResult {
  watch: Watch;
  seal: string;
}

export async function decideWatch(
  ownerId: string,
  id: string,
  rawDecision: unknown,
): Promise<DecideResult> {
  const decision = normaliseDecision(rawDecision);
  const watch = await loadWatch(ownerId, id);
  assertOwned(watch, ownerId);
  const db = await getDb();
  const now = new Date();

  await db.query(
    `UPDATE watches SET decision = $2, updated_at = $3::timestamptz WHERE id = $1`,
    [id, decision, now.toISOString()],
  );
  const seal = await appendAudit(db, id, "decide", { decision }, now);
  return { watch: await loadWatch(ownerId, id), seal };
}

/**
 * Soft-delete. The row is retained with `deleted_at` set so the audit chain
 * stays replayable and the tombstone remains inspectable.
 *
 * The caller must present the latest observation's engine seal. That is a
 * capability check rather than a formality: only something that could already
 * read this record knows the seal, so a third party cannot destroy it.
 */
export async function deleteWatch(
  ownerId: string,
  id: string,
  presentedSeal: string,
): Promise<{ seal: string; tombstoneId: string }> {
  const watch = await loadWatch(ownerId, id, { includeDeleted: true });
  assertOwned(watch, ownerId);
  if (watch.deletedAt) {
    throw new ApiError("gone", "this watch has already been deleted");
  }
  const db = await getDb();
  const now = new Date();

  const latest = await db.query<{ seal: string }>(
    `SELECT engine->>'seal' AS seal FROM observations
      WHERE watch_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id],
  );
  const expected = latest[0]?.seal ?? "";
  assertSealMatches(presentedSeal, expected);

  const seal = await appendAudit(db, id, "delete", { host: watch.host, at: now.toISOString() }, now);
  await db.query(
    `UPDATE watches SET deleted_at = $2::timestamptz, updated_at = $2::timestamptz WHERE id = $1`,
    [id, now.toISOString()],
  );
  return { seal, tombstoneId: id };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function readSettings(
  ownerId: string,
): Promise<{ retentionYears: number; machine: MachineModel; updatedAt: string }> {
  const db = await getDb();
  const rows = await db.query<{
    retention_years: number | string;
    machine: unknown;
    updated_at: Date | string;
  }>("SELECT * FROM settings WHERE owner_id = $1", [ownerId]);

  if (!rows[0]) {
    return { retentionYears: 10, machine: DEFAULT_MACHINE, updatedAt: new Date(0).toISOString() };
  }
  return {
    retentionYears: Number(rows[0].retention_years),
    machine: parseMachine(rows[0].machine),
    updatedAt: toIso(rows[0].updated_at) ?? "",
  };
}

export async function writeSettings(
  ownerId: string,
  input: { retentionYears?: unknown; machine?: unknown },
): Promise<{ retentionYears: number; machine: MachineModel; updatedAt: string; seal: string }> {
  const retentionYears = normaliseRetentionYears(input.retentionYears);
  const machine = normaliseMachine(input.machine);
  const db = await getDb();
  const now = new Date();

  await db.query(
    `INSERT INTO settings (owner_id, retention_years, machine, updated_at)
     VALUES ($1,$2,$3::jsonb,$4::timestamptz)
     ON CONFLICT (owner_id) DO UPDATE SET
       retention_years = EXCLUDED.retention_years,
       machine = EXCLUDED.machine,
       updated_at = EXCLUDED.updated_at`,
    [ownerId, retentionYears, JSON.stringify(machine), now.toISOString()],
  );
  const seal = await appendAudit(
    db,
    `settings:${ownerId}`,
    "update_settings",
    { retentionYears, machine },
    now,
  );
  return { retentionYears, machine, updatedAt: now.toISOString(), seal };
}

// ---------------------------------------------------------------------------
// Analysis across every watch
// ---------------------------------------------------------------------------

export interface RankedEntry {
  watchId: string;
  host: string;
  label: string;
  decision: Decision;
  live: boolean;
  observationId: string;
  spkiSha256: string;
  algorithmLabel: string;
  bits: number | null;
  score: number;
  verdict: Verdict;
  daysToCrq: number;
  crqDate: string;
  retentionYears: number;
  physicalQubitsNeeded: number;
  logicalQubitsNeeded: number;
  budgetFraction: number;
  seal: string;
  updatedAt: string;
}

export async function rankAll(ownerId: string): Promise<RankedEntry[]> {
  const db = await getDb();
  const rows = await db.query<{
    watch_id: string;
    host: string;
    label: string;
    decision: string;
    live: boolean;
    observation_id: string;
    spki_sha256: string;
    parameter_label: string | null;
    algorithm: string;
    bits: number | null;
    engine: unknown;
    retention_years: number | string;
    updated_at: Date | string;
  }>(
    `SELECT w.id AS watch_id, w.host, w.label, w.decision, w.live, w.retention_years, w.updated_at,
            o.id AS observation_id, o.spki_sha256, o.parameter_label, o.algorithm, o.bits, o.engine
       FROM watches w
       JOIN observations o ON o.watch_id = w.id
      WHERE (w.owner_id = $1 OR w.owner_id = $2) AND w.deleted_at IS NULL
      ORDER BY w.created_at ASC`,
    [ownerId, DEMO_OWNER],
  );

  return rows.map((row) => {
    const engine = (typeof row.engine === "string" ? JSON.parse(row.engine) : row.engine) as EngineResult;
    return {
      watchId: row.watch_id,
      host: row.host,
      label: row.label,
      decision: row.decision as Decision,
      live: row.live,
      observationId: row.observation_id,
      spkiSha256: row.spki_sha256,
      algorithmLabel: row.parameter_label ?? row.algorithm,
      bits: row.bits,
      score: engine.score,
      verdict: engine.verdict,
      daysToCrq: engine.daysToCrq,
      crqDate: engine.crqDate,
      retentionYears: Number(row.retention_years),
      physicalQubitsNeeded: engine.quantum.physicalQubitsNeeded,
      logicalQubitsNeeded: engine.quantum.logicalQubitsNeeded,
      budgetFraction: engine.quantum.budgetFraction,
      seal: engine.seal,
      updatedAt: toIso(row.updated_at) ?? "",
    };
  });
}

export { newId, randomUUID };