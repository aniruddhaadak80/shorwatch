/**
 * Canonical JSON and the append-only per-entity seal chain.
 *
 * Canonical form: object keys sorted recursively, arrays left in their given
 * order, no insignificant whitespace, UTF-8. Two runs over the same logical
 * record therefore produce byte-identical output and an identical seal.
 *
 * Chain rule: seal_n = SHA-384( UTF-8(prevSeal) || canonicalJson(event_n) )
 * with a fixed genesis value for n = 1.
 */

import { createHash } from "node:crypto";

export const GENESIS_SEAL = "0".repeat(96);

/** JSON value that can be canonicalised. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonicalise(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(source).sort()) {
      const raw = source[key];
      // `undefined` means the key is absent, which is distinct from an explicit null.
      if (raw === undefined) continue;
      out[key] = canonicalise(raw);
    }
    return out;
  }
  return null;
}

/** Deterministic JSON string with recursively sorted object keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

export function sha384Hex(input: string): string {
  return createHash("sha384").update(input, "utf8").digest("hex");
}

/**
 * Seal one event onto a chain.
 * `previousSeal` must be the prior event's seal, or GENESIS_SEAL for the first.
 */
export function sealEvent(
  previousSeal: string,
  event: Record<string, unknown>,
): { prevSeal: string; seal: string } {
  const prevSeal = previousSeal || GENESIS_SEAL;
  const digest = createHash("sha384")
    .update(prevSeal, "utf8")
    .update(canonicalJson(event), "utf8")
    .digest("hex");
  return { prevSeal, seal: digest };
}

export interface ChainEvent {
  seq: number;
  entityId: string;
  action: string;
  at: string;
  payload: Record<string, unknown>;
}

export interface SealRow {
  seq: number;
  prevSeal: string;
  seal: string;
}

export interface ReplayResult {
  ok: boolean;
  /** Number of events checked. */
  checked: number;
  /** Sequence number of the first event that failed to verify, or null. */
  brokenAt: number | null;
  /** Human-readable reason for the break, or null. */
  reason: string | null;
  /** Seal of the final event in the chain. */
  headSeal: string;
}

/**
 * Recompute an entire chain and report the first broken link.
 * Order is by `seq`; callers pass events already sorted.
 */
export function replayChain(
  events: Array<ChainEvent & { prevSeal: string; seal: string }>,
): ReplayResult {
  let previous = GENESIS_SEAL;
  let checked = 0;

  for (const event of events) {
    if (event.prevSeal !== previous) {
      return {
        ok: false,
        checked,
        brokenAt: event.seq,
        reason: `event ${event.seq} records prevSeal ${event.prevSeal.slice(0, 16)}… but the chain head was ${previous.slice(0, 16)}…`,
        headSeal: previous,
      };
    }
    const expected = sealEvent(previous, {
      seq: event.seq,
      entityId: event.entityId,
      action: event.action,
      at: event.at,
      payload: event.payload,
    });
    if (expected.seal !== event.seal) {
      return {
        ok: false,
        checked,
        brokenAt: event.seq,
        reason: `event ${event.seq} payload does not match its recorded seal`,
        headSeal: previous,
      };
    }
    previous = event.seal;
    checked += 1;
  }

  return { ok: true, checked, brokenAt: null, reason: null, headSeal: previous };
}