import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  GENESIS_SEAL,
  replayChain,
  sealEvent,
  sha384Hex,
} from "./seal";

describe("canonical JSON", () => {
  it("sorts object keys recursively", () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("is insensitive to key insertion order", () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it("treats null and undefined as absent, and non-finite numbers as null", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson({ a: Number.NaN, b: Number.POSITIVE_INFINITY })).toBe(
      '{"a":null,"b":null}',
    );
  });

  it("serialises dates deterministically", () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    expect(canonicalJson({ when })).toBe('{"when":"2026-01-02T03:04:05.000Z"}');
  });

  it("handles empty structures", () => {
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });
});

describe("sealEvent", () => {
  const event = {
    seq: 1,
    entityId: "wch_1",
    action: "create",
    at: "2026-01-01T00:00:00.000Z",
    payload: { host: "example.com" },
  };

  it("produces a 96-character hex digest", () => {
    const { seal } = sealEvent(GENESIS_SEAL, event);
    expect(seal).toMatch(/^[0-9a-f]{96}$/);
  });

  it("is deterministic for identical input", () => {
    expect(sealEvent(GENESIS_SEAL, event).seal).toBe(sealEvent(GENESIS_SEAL, event).seal);
  });

  it("changes when the previous seal changes", () => {
    const other = sha384Hex("a different chain");
    expect(sealEvent(GENESIS_SEAL, event).seal).not.toBe(sealEvent(other, event).seal);
  });

  it("changes when any payload field changes", () => {
    const base = sealEvent(GENESIS_SEAL, event).seal;
    expect(sealEvent(GENESIS_SEAL, { ...event, payload: { host: "example.net" } }).seal).not.toBe(base);
    expect(sealEvent(GENESIS_SEAL, { ...event, action: "update" }).seal).not.toBe(base);
    expect(sealEvent(GENESIS_SEAL, { ...event, seq: 2 }).seal).not.toBe(base);
  });

  it("ignores key order inside the payload", () => {
    const a = sealEvent(GENESIS_SEAL, { ...event, payload: { a: 1, b: 2 } }).seal;
    const b = sealEvent(GENESIS_SEAL, { ...event, payload: { b: 2, a: 1 } }).seal;
    expect(a).toBe(b);
  });

  it("treats a blank previous seal as genesis", () => {
    expect(sealEvent("", event).seal).toBe(sealEvent(GENESIS_SEAL, event).seal);
  });
});

/** Build a chain of the given length with correct linkage. */
function buildChain(length: number) {
  const rows: Array<{
    seq: number;
    entityId: string;
    action: string;
    at: string;
    payload: Record<string, unknown>;
    prevSeal: string;
    seal: string;
  }> = [];
  let previous = GENESIS_SEAL;
  for (let seq = 1; seq <= length; seq += 1) {
    const base = {
      seq,
      entityId: "wch_1",
      action: `action_${seq}`,
      at: new Date(Date.UTC(2026, 0, seq)).toISOString(),
      payload: { index: seq },
    };
    const { seal } = sealEvent(previous, base);
    rows.push({ ...base, prevSeal: previous, seal });
    previous = seal;
  }
  return rows;
}

describe("replayChain", () => {
  it("accepts an untouched chain", () => {
    const result = replayChain(buildChain(5));
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(5);
    expect(result.brokenAt).toBeNull();
    expect(result.headSeal).toMatch(/^[0-9a-f]{96}$/);
  });

  it("accepts an empty chain and reports the genesis head", () => {
    const result = replayChain([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.headSeal).toBe(GENESIS_SEAL);
  });

  it("accepts a single-event chain", () => {
    expect(replayChain(buildChain(1)).ok).toBe(true);
  });

  it("detects an edited payload and names the event", () => {
    const rows = buildChain(4);
    rows[2].payload = { index: 999 };
    const result = replayChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toMatch(/payload does not match/);
  });

  it("detects a rewritten prevSeal link", () => {
    const rows = buildChain(4);
    rows[1].prevSeal = GENESIS_SEAL;
    const result = replayChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toMatch(/records prevSeal/);
  });

  it("detects a deleted event by the break that follows it", () => {
    const rows = buildChain(5);
    rows.splice(2, 1);
    const result = replayChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(4);
  });

  it("reports the first break when several links are damaged", () => {
    const rows = buildChain(6);
    rows[3].payload = { index: 0 };
    rows[5].prevSeal = GENESIS_SEAL;
    expect(replayChain(rows).brokenAt).toBe(4);
  });
});