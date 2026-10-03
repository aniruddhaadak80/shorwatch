import { describe, expect, it } from "vitest";
import { classicalSecurityBits, crqYearFor, evaluateHarvest } from "./index";
import { ENGINE_NAME, ENGINE_VERSION, WEIGHTS, WEIGHT_SUM } from "./constants";
import { canonicalJson, sealEvent } from "../integrity/seal";
import {
  DEFAULT_MACHINE,
  type HarvestInput,
  type KeyAlgorithm,
  type MachineModel,
} from "../types";
import { evaluateHarvest as _unused } from "./index";
void _unused;

const NOW = new Date("2026-01-15T00:00:00.000Z");

function liveSource() {
  return {
    sourceId: "tls-wire",
    label: "Live TLS handshake",
    url: "https://nodejs.org/api/tls.html",
    status: "live" as const,
    fetchedAt: NOW.toISOString(),
  };
}

interface Options {
  algorithm?: KeyAlgorithm;
  algorithmOid?: string;
  parameterLabel?: string | null;
  bits?: number | null;
  nistLevel?: number | null;
  notBefore?: string;
  retentionYears?: number;
  firstSeen?: string | null;
  openPorts?: number[];
  vulnerabilities?: string[];
  machine?: Partial<MachineModel>;
  transparency?: boolean;
}

function makeInput(options: Options = {}): HarvestInput {
  const {
    algorithm = "rsa",
    algorithmOid = "1.2.840.113549.1.1.1",
    parameterLabel = null,
    bits = 2048,
    nistLevel = null,
    notBefore = "2025-06-01T00:00:00.000Z",
    retentionYears = 10,
    firstSeen = "2025-06-01T00:00:00.000Z",
    openPorts = [443],
    vulnerabilities = [],
    machine = {},
    transparency = true,
  } = options;

  return {
    observation: {
      host: "example.com",
      subjectCommonName: "example.com",
      subjectAlternativeNames: ["example.com"],
      issuerCommonName: "Test CA",
      issuerOrganisation: "Test",
      notBefore,
      notAfter: "2026-06-01T00:00:00.000Z",
      serialNumber: "01",
      spkiSha256: "a".repeat(64),
      certificateSha256: "b".repeat(64),
      protocol: "TLSv1.3",
      cipher: "TLS_AES_256_GCM_SHA384",
      key: { algorithm, algorithmOid, parameterOid: null, parameterLabel, bits, nistLevel },
      hostnameMatched: true,
      source: liveSource(),
    },
    transparency: transparency
      ? {
          pubkeySha256: "a".repeat(64),
          firstSeen: firstSeen as string,
          validUntil: "2026-06-01T00:00:00.000Z",
          dnsNames: ["example.com"],
          revoked: false,
          issuanceCount: 3,
          source: liveSource(),
        }
      : null,
    dns: {
      host: "example.com",
      caaAuthorisation: ['0 issue "letsencrypt.org"'],
      addresses: ["93.184.216.34"],
      mailExchange: [],
      resolver: "dns.google",
      source: liveSource(),
    },
    surface: {
      ip: "93.184.216.34",
      hostnames: ["example.com"],
      openPorts,
      vulnerabilities,
      tags: ["cloud"],
      source: liveSource(),
    },
    retentionYears,
    machine: { ...DEFAULT_MACHINE, ...machine },
  };
}

describe("evaluateHarvest", () => {
  it("returns a versioned result with every factor itemised", () => {
    const result = evaluateHarvest(makeInput(), { now: NOW });

    expect(result.engine).toBe(ENGINE_NAME);
    expect(result.version).toBe(ENGINE_VERSION);
    expect(result.factors).toHaveLength(5);
    for (const factor of result.factors) {
      expect(factor.label.length).toBeGreaterThan(0);
      expect(factor.detail.length).toBeGreaterThan(10);
      expect(factor.raw).toBeGreaterThanOrEqual(0);
      expect(factor.raw).toBeLessThanOrEqual(1);
      expect(factor.contribution).toBe(Math.round(factor.weight * factor.raw * 100 * 100) / 100);
    }
    expect(result.weights).toEqual({ ...WEIGHTS });
  });

  it("produces a bounded score and an actionable recommendation", () => {
    const result = evaluateHarvest(makeInput(), { now: NOW });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.recommendation.length).toBeGreaterThan(20);
    expect(result.seal).toMatch(/^[0-9a-f]{96}$/);
  });

  it("is deterministic: identical input yields a byte-identical result", () => {
    const input = makeInput();
    const a = evaluateHarvest(input, { now: NOW });
    const b = evaluateHarvest(input, { now: NOW });
    expect(canonicalJson(b)).toBe(canonicalJson(a));
    expect(b.seal).toBe(a.seal);
  });

  it("changes the score when the modulus grows", () => {
    const small = evaluateHarvest(makeInput({ bits: 2048 }), { now: NOW });
    const large = evaluateHarvest(makeInput({ bits: 4096 }), { now: NOW });
    expect(large.daysToCrq).toBeGreaterThan(small.daysToCrq);
    expect(large.quantum.logicalQubitsNeeded).toBeGreaterThan(
      small.quantum.logicalQubitsNeeded,
    );
    expect(large.quantum.physicalQubitsNeeded).toBeGreaterThan(
      small.quantum.physicalQubitsNeeded,
    );
  });

  it("scores a post-quantum key as viable and reports no factor resource", () => {
    const result = evaluateHarvest(
      makeInput({
        algorithm: "ml-kem",
        algorithmOid: "2.16.840.1.101.3.4.2.2",
        parameterLabel: "ML-KEM-768",
        bits: null,
        nistLevel: 3,
      }),
      { now: NOW },
    );
    expect(result.verdict).toBe("quantum_viable");
    expect(result.daysToCrq).toBeGreaterThan(1_000_000);
    expect(result.quantum.estimated).toBe(false);
    expect(result.recommendation).toMatch(/Hold/);
    expect(result.classicalSecurityBits).toBe(192);
  });

  it("scores an unknown family without claiming resistance", () => {
    const result = evaluateHarvest(
      makeInput({ algorithm: "unknown", algorithmOid: "1.2.3.4", bits: null }),
      { now: NOW },
    );
    expect(result.verdict).toBe("window_closing");
    expect(result.factors.find((f) => f.key === "quantumWeakness")?.raw).toBe(0.5);
    expect(result.classicalSecurityBits).toBe(0);
  });

  it("raises exposure as the public record gets longer", () => {
    const recent = evaluateHarvest(makeInput({ firstSeen: "2026-01-10T00:00:00.000Z" }), { now: NOW });
    const old = evaluateHarvest(makeInput({ firstSeen: "2015-01-01T00:00:00.000Z" }), { now: NOW });
    expect(old.factors.find((f) => f.key === "publicExposure")!.raw).toBeGreaterThan(
      recent.factors.find((f) => f.key === "publicExposure")!.raw,
    );
  });

  it("falls back to the certificate start when no CT record exists", () => {
    const result = evaluateHarvest(makeInput({ transparency: false }), { now: NOW });
    expect(result.factors.find((f) => f.key === "publicExposure")?.detail).toMatch(
      /No Transparency record/,
    );
  });

  it("raises exposure with more open ports and vulnerabilities", () => {
    const calm = evaluateHarvest(makeInput({ openPorts: [443] }), { now: NOW });
    const busy = evaluateHarvest(
      makeInput({ openPorts: [21, 22, 25, 80, 443, 3389, 5432], vulnerabilities: ["CVE-x", "CVE-y"] }),
      { now: NOW },
    );
    expect(busy.factors.find((f) => f.key === "attackSurface")!.raw).toBeGreaterThan(
      calm.factors.find((f) => f.key === "attackSurface")!.raw,
    );
  });

  it("reports a mid-range surface factor when no address data exists", () => {
    const input = makeInput();
    const without = evaluateHarvest({ ...input, surface: null }, { now: NOW });
    expect(without.factors.find((f) => f.key === "attackSurface")?.raw).toBe(0.5);
  });

  it("moves the lead-time factor as the deadline approaches", () => {
    const far = evaluateHarvest(makeInput({ bits: 16384 }), { now: NOW });
    const near = evaluateHarvest(makeInput({ bits: 1024 }), { now: NOW });
    expect(far.leadTimeDays).toBeGreaterThan(near.leadTimeDays);
  });

  it("applies a bounded quantum advisor adjustment", () => {
    const result = evaluateHarvest(makeInput(), { now: NOW });
    expect(Math.abs(result.advisor.adjustment)).toBeLessThanOrEqual(3.5 + 1e-9);
    expect(result.advisor.description).toMatch(/exact statevector/);
    expect(Math.abs(result.advisor.expectationZ)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.advisor.expectationZZ)).toBeLessThanOrEqual(1);
  });

  it("keeps the weighted total inside 0..100 even at the extremes", () => {
    const worst = evaluateHarvest(
      makeInput({
        bits: 1024,
        firstSeen: "2000-01-01T00:00:00.000Z",
        retentionYears: 100,
        openPorts: Array.from({ length: 30 }, (_, i) => 1000 + i),
        vulnerabilities: ["a", "b", "c", "d"],
      }),
      { now: NOW },
    );
    const best = evaluateHarvest(
      makeInput({
        algorithm: "ml-dsa",
        algorithmOid: "1.2.3.4",
        parameterLabel: "ML-DSA-87",
        bits: null,
        nistLevel: 5,
        firstSeen: NOW.toISOString(),
        retentionYears: 0,
        openPorts: [],
      }),
      { now: NOW },
    );
    for (const result of [worst, best]) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(result.score)).toBe(true);
    }
    expect(worst.score).toBeGreaterThan(best.score);
  });

  it("survives malformed and boundary input without throwing", () => {
    const base = makeInput();
    const malformed: HarvestInput = {
      ...base,
      retentionYears: 0,
      machine: { logicalQubits: 1, physicalQubits: 1, physicalErrorRate: 1e-6 },
      observation: { ...base.observation, notBefore: "not-a-date" },
    };
    const result = evaluateHarvest(malformed, { now: NOW });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.seal).toMatch(/^[0-9a-f]{96}$/);

    const zeroBits = evaluateHarvest(makeInput({ bits: 0 }), { now: NOW });
    expect(Number.isFinite(zeroBits.score)).toBe(true);

    const noSurface = evaluateHarvest({ ...base, surface: null, dns: null, transparency: null }, {
      now: NOW,
    });
    expect(Number.isFinite(noSurface.score)).toBe(true);
  });

  it("publishes a seal that recomputes from the result it describes", () => {
    const result = evaluateHarvest(makeInput(), { now: NOW, sealSeed: "wch_1:key" });

    // The engine seal covers the published result, so a reader can recompute it
    // from the response body alone and detect a doctored score.
    const recomputed = sealEvent("0".repeat(96), {
      seed: "wch_1:key",
      engine: result.engine,
      version: result.version,
      score: result.score,
      verdict: result.verdict,
      crqDate: result.crqDate,
      evaluatedAt: result.evaluatedAt,
      factors: result.factors.map((f) => ({ key: f.key, raw: f.raw, weight: f.weight })),
    });
    expect(recomputed.seal).toBe(result.seal);

    const doctored = { ...result, score: Math.min(100, result.score + 1) };
    const doctoredSeal = sealEvent("0".repeat(96), {
      seed: "wch_1:key",
      engine: doctored.engine,
      version: doctored.version,
      score: doctored.score,
      verdict: doctored.verdict,
      crqDate: doctored.crqDate,
      evaluatedAt: doctored.evaluatedAt,
      factors: doctored.factors.map((f) => ({ key: f.key, raw: f.raw, weight: f.weight })),
    });
    expect(doctoredSeal.seal).not.toBe(result.seal);
  });

  it("weights sum to one in the emitted result", () => {
    const emitted = Object.values(evaluateHarvest(makeInput(), { now: NOW }).weights).reduce(
      (a, b) => a + b,
      0,
    );
    expect(emitted).toBeCloseTo(WEIGHT_SUM, 12);
  });
});

describe("family helpers", () => {
  it("reports NIST strength per family", () => {
    expect(classicalSecurityBits("rsa", makeInput({ bits: 2048 }))).toBe(112);
    expect(classicalSecurityBits("rsa", makeInput({ bits: 4096 }))).toBe(152);
    expect(classicalSecurityBits("unknown", makeInput({ algorithm: "unknown" }))).toBe(0);
  });

  it("gives post-quantum families no projected break date", () => {
    expect(
      crqYearFor("ml-kem", makeInput({ algorithm: "ml-kem", bits: null, nistLevel: 3 })),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(crqYearFor("rsa", makeInput({ bits: 2048 }))).toBe(2035);
  });
});