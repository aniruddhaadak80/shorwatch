/**
 * Schema, indexes and constraints. Applied identically by both adapters.
 *
 * Every statement is idempotent so first run, cold start and deploy all converge
 * on the same shape without a separate migration step.
 */

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS watches (
     id                TEXT PRIMARY KEY,
     owner_id          TEXT        NOT NULL,
     host              TEXT        NOT NULL,
     label             TEXT        NOT NULL DEFAULT '',
     retention_years   DOUBLE PRECISION NOT NULL DEFAULT 10,
     machine           JSONB       NOT NULL,
     decision          TEXT        NOT NULL DEFAULT 'undecided',
     notes             TEXT        NOT NULL DEFAULT '',
     live              BOOLEAN     NOT NULL DEFAULT FALSE,
     last_probed_at    TIMESTAMPTZ,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     deleted_at        TIMESTAMPTZ,
     CHECK (char_length(id) BETWEEN 8 AND 64),
     CHECK (char_length(host) BETWEEN 1 AND 253),
     CHECK (char_length(owner_id) = 32),
     CHECK (retention_years >= 0 AND retention_years <= 100),
     CHECK (decision IN ('undecided','rotate_now','hybrid_migrate','accept_monitor'))
   )`,

  `CREATE INDEX IF NOT EXISTS watches_owner_created_idx
     ON watches (owner_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS watches_owner_host_idx
     ON watches (owner_id, host)`,
  `CREATE INDEX IF NOT EXISTS watches_owner_live_idx
     ON watches (owner_id) WHERE deleted_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS observations (
     id                TEXT PRIMARY KEY,
     watch_id          TEXT        NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
     owner_id          TEXT        NOT NULL,
     spki_sha256       TEXT        NOT NULL,
     certificate_sha256 TEXT       NOT NULL,
     algorithm         TEXT        NOT NULL,
     algorithm_oid     TEXT        NOT NULL,
     parameter_oid     TEXT,
     parameter_label   TEXT,
     bits              INTEGER,
     nist_level        INTEGER,
     spki_der          TEXT,
     payload           JSONB       NOT NULL,
     engine            JSONB       NOT NULL,
     live              BOOLEAN     NOT NULL DEFAULT FALSE,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     CHECK (char_length(spki_sha256) = 64),
     CHECK (char_length(certificate_sha256) = 64)
   )`,

  `CREATE INDEX IF NOT EXISTS observations_watch_idx
     ON observations (watch_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS observations_owner_idx
     ON observations (owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS observations_watch_key_unique
     ON observations (watch_id, spki_sha256)`,

  `CREATE TABLE IF NOT EXISTS audit_events (
     entity_id   TEXT        NOT NULL,
     seq         INTEGER     NOT NULL,
     action      TEXT        NOT NULL,
     at          TIMESTAMPTZ NOT NULL DEFAULT now(),
     payload     JSONB       NOT NULL,
     prev_seal   TEXT        NOT NULL,
     seal        TEXT        NOT NULL,
     PRIMARY KEY (entity_id, seq),
     CHECK (seq >= 1),
     CHECK (char_length(seal) = 96)
   )`,

  `CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events (entity_id, seq ASC)`,

  `CREATE TABLE IF NOT EXISTS settings (
     owner_id        TEXT PRIMARY KEY,
     retention_years DOUBLE PRECISION NOT NULL DEFAULT 10,
     machine         JSONB       NOT NULL,
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     CHECK (char_length(owner_id) = 32)
   )`,

  `CREATE TABLE IF NOT EXISTS idempotency (
     key         TEXT        NOT NULL,
     owner_id    TEXT        NOT NULL,
     endpoint    TEXT        NOT NULL,
     result      JSONB       NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (key, owner_id, endpoint),
     CHECK (char_length(key) <= 200)
   )`,

  `CREATE INDEX IF NOT EXISTS idempotency_created_idx ON idempotency (created_at)`,
];

/** Rows created on first run so the workspace is never empty on a cold deploy. */
export interface SeedWatch {
  id: string;
  ownerId: string;
  host: string;
  label: string;
  retentionYears: number;
  machine: { logicalQubits: number; physicalQubits: number; physicalErrorRate: number };
  decision: string;
  notes: string;
  live: boolean;
}

export const DEMO_OWNER = "00000000000000000000000000000000";

export const SEED_WATCHES: readonly SeedWatch[] = [
  {
    id: "seed-vercel-app",
    ownerId: DEMO_OWNER,
    host: "vercel.com",
    label: "Reference: a large RSA-2048 deployment",
    retentionYears: 10,
    machine: { logicalQubits: 4000, physicalQubits: 20_000_000, physicalErrorRate: 0.001 },
    decision: "undecided",
    notes:
      "Seeded example. Points at a host that serves an RSA-2048 certificate, so the queue has a genuinely Shor-exposed key to triage.",
    live: false,
  },
  {
    id: "seed-github-app",
    ownerId: DEMO_OWNER,
    host: "github.com",
    label: "Reference: a P-256 deployment",
    retentionYears: 10,
    machine: { logicalQubits: 4000, physicalQubits: 20_000_000, physicalErrorRate: 0.001 },
    decision: "undecided",
    notes:
      "Seeded example. Points at a host on an elliptic curve, which is Shor-broken too but on a different cost curve.",
    live: false,
  },
];