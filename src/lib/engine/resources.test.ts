import { describe, expect, it } from "vitest";
import {
  codeDistance,
  crqYearForEc,
  crqYearForRsa,
  daysBetween,
  ecClassicalStrength,
  isQuantumSafe,
  isShorBroken,
  leadTimeRaw,
  logicalQubitsNeeded,
  physicalQubitsNeeded,
  publicExposureRaw,
  quantumResource,
  retentionOverlapRaw,
  rsaClassicalStrength,
} from "./resources";
import {
  CRQ_MAX_YEAR,
  CRQ_MIN_YEAR,
  MIGRATION_LEAD_DAYS,
  NIST_RSA_ANCHORS,
  PQC_PARAMETERS,
  SHOR_ANCHOR,
  WEIGHT_SUM,
  CT_SATURATION_DAYS,
} from "./constants";
import { DEFAULT_MACHINE } from "../types";

describe("published weight table", () => {
  it("sums to exactly one", () => {
    expect(WEIGHT_SUM).toBeCloseTo(1, 12);
  });
});

describe("NIST comparable security", () => {
  it("reproduces every SP 800-57 RSA anchor exactly", () => {
    for (const anchor of NIST_RSA_ANCHORS) {
      expect(rsaClassicalStrength(anchor.bits)).toBeCloseTo(anchor.strength, 6);
    }
  });

  it("interpolates between anchors", () => {
    // Halfway in log space between 2048 and 3072.
    const midpoint = rsaClassicalStrength(Math.sqrt(2048 * 3072));
    expect(midpoint).toBeGreaterThan(112);
    expect(midpoint).toBeLessThan(128);
  });

  it("is monotonic in modulus size", () => {
    let previous = 0;
    for (let bits = 1024; bits <= 4096; bits += 64) {
      const strength = rsaClassicalStrength(bits);
      expect(strength).toBeGreaterThanOrEqual(previous);
      previous = strength;
    }
  });

  it("clamps outside the anchored range instead of diverging", () => {
    expect(rsaClassicalStrength(512)).toBe(80);
    expect(Number.isFinite(rsaClassicalStrength(16384))).toBe(true);
  });

  it("maps named curves to their published strength", () => {
    expect(ecClassicalStrength("P-256", 256)).toBe(128);
    expect(ecClassicalStrength("P-384", 384)).toBe(192);
    expect(ecClassicalStrength("P-521", 521)).toBe(256);
  });

  it("falls back to the nearest curve when the label is unknown", () => {
    expect(ecClassicalStrength(null, 384)).toBe(192);
    expect(ecClassicalStrength(null, null)).toBe(0);
  });
});

describe("quantum resistance classification", () => {
  it("treats every currently deployed family as Shor-broken", () => {
    for (const family of ["rsa", "ec", "ed25519", "ed448", "x25519", "x448"] as const) {
      expect(isShorBroken(family)).toBe(true);
      expect(isQuantumSafe(family)).toBe(false);
    }
  });

  it("treats post-quantum parameter sets as resistant", () => {
    for (const family of ["ml-dsa", "ml-kem", "hybrid"] as const) {
      expect(isQuantumSafe(family)).toBe(true);
      expect(isShorBroken(family)).toBe(false);
    }
  });

  it("claims nothing for an unrecognised family", () => {
    expect(isShorBroken("unknown")).toBe(false);
    expect(isQuantumSafe("unknown")).toBe(false);
  });
});

describe("Shor resource model", () => {
  it("reproduces the published RSA-2048 anchor exactly", () => {
    expect(logicalQubitsNeeded(2048)).toBe(SHOR_ANCHOR.logicalQubits);
  });

  it("reproduces the published physical qubit count at the anchor error rate", () => {
    const physical = physicalQubitsNeeded(2048, SHOR_ANCHOR.physicalErrorRate);
    expect(Math.abs(physical - SHOR_ANCHOR.physicalQubits) / SHOR_ANCHOR.physicalQubits).toBeLessThan(0.5);
  });

  it("grows monotonically with modulus size", () => {
    let previous = 0;
    for (let bits = 1024; bits <= 8192; bits += 256) {
      const needed = logicalQubitsNeeded(bits);
      expect(needed).toBeGreaterThan(previous);
      previous = needed;
    }
  });

  it("demands more physical qubits as the physical error rate improves", () => {
    // Physically correct direction: to hit the same logical error rate with a
    // cleaner device you need a larger code distance, hence more physical qubits.
    const noisy = physicalQubitsNeeded(2048, 1e-2);
    const fair = physicalQubitsNeeded(2048, 1e-3);
    const clean = physicalQubitsNeeded(2048, 1e-4);
    expect(noisy).toBeLessThan(fair);
    expect(fair).toBeLessThan(clean);
    // The anchor sits exactly at the published figure.
    expect(fair).toBe(SHOR_ANCHOR.physicalQubits);
  });

  it("bounds the code distance and never returns a degenerate value", () => {
    expect(codeDistance(1e-6)).toBeGreaterThanOrEqual(3);
    expect(codeDistance(1e-1)).toBeGreaterThanOrEqual(3);
    expect(codeDistance(1)).toBeGreaterThanOrEqual(3);
    expect(codeDistance(-5)).toBeGreaterThanOrEqual(3);
  });

  it("reports a budget fraction against the assumed machine", () => {
    const cheap = quantumResource(2048, DEFAULT_MACHINE);
    const huge = quantumResource(4096, { ...DEFAULT_MACHINE, physicalQubits: 1e12 });
    expect(cheap.budgetFraction).toBeGreaterThan(0);
    expect(huge.budgetFraction).toBeLessThan(cheap.budgetFraction!);
    expect(huge.estimated).toBe(true);
    expect(huge.anchor).toMatch(/Gidney/);
  });

  it("handles a degenerate modulus without dividing by zero", () => {
    expect(Number.isFinite(logicalQubitsNeeded(0))).toBe(true);
    expect(logicalQubitsNeeded(0)).toBeGreaterThan(0);
    const noMachine = quantumResource(2048, { ...DEFAULT_MACHINE, physicalQubits: 0 });
    expect(noMachine.budgetFraction).toBe(0);
  });
});

describe("CRQ projection", () => {
  it("places RSA-2048 exactly on the published anchor year", () => {
    expect(crqYearForRsa(2048)).toBe(2035);
  });

  it("moves later for larger moduli and earlier for smaller ones", () => {
    expect(crqYearForRsa(4096)).toBeGreaterThan(crqYearForRsa(2048));
    expect(crqYearForRsa(1024)).toBeLessThan(crqYearForRsa(2048));
  });

  it("is monotonic in modulus size", () => {
    let previous = -Infinity;
    for (let bits = 512; bits <= 16384; bits *= 2) {
      const year = crqYearForRsa(bits);
      expect(year).toBeGreaterThanOrEqual(previous);
      previous = year;
    }
  });

  it("clamps into the published window", () => {
    for (let bits = 128; bits <= 1 << 22; bits *= 2) {
      const year = crqYearForRsa(bits);
      expect(year).toBeGreaterThanOrEqual(CRQ_MIN_YEAR);
      expect(year).toBeLessThanOrEqual(CRQ_MAX_YEAR);
    }
  });

  it("breaks elliptic curves sooner than factoring at equal strength", () => {
    // P-256 is a 128-bit curve; the 128-bit RSA anchor is RSA-3072.
    expect(crqYearForEc(128, 256)).toBeLessThan(crqYearForRsa(3072));
  });

  it("moves later for stronger curves", () => {
    expect(crqYearForEc(256, 521)).toBeGreaterThan(crqYearForEc(128, 256));
  });
});

describe("factor normalisation", () => {
  it("treats a key logged today as minimally exposed", () => {
    expect(publicExposureRaw(0)).toBe(0);
  });

  it("saturates at the published horizon", () => {
    expect(publicExposureRaw(CT_SATURATION_DAYS * 10)).toBe(1);
    expect(publicExposureRaw(CT_SATURATION_DAYS)).toBeCloseTo(1, 6);
  });

  it("rejects nonsense exposure values", () => {
    expect(publicExposureRaw(-10)).toBe(0);
    expect(publicExposureRaw(Number.NaN)).toBe(0);
    expect(publicExposureRaw(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("is monotonic in days exposed", () => {
    let previous = -1;
    for (let days = 0; days <= 2000; days += 100) {
      const value = publicExposureRaw(days);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("gives full retention overlap when the requirement outlasts the deadline", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const crq = new Date("2030-01-01T00:00:00Z");
    const result = retentionOverlapRaw(50, crq, now);
    expect(result.raw).toBe(1);
    expect(result.overlapDate.getUTCFullYear()).toBe(2076);
  });

  it("gives zero overlap when nothing needs protecting past the deadline", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const crq = new Date("2026-06-01T00:00:00Z");
    expect(retentionOverlapRaw(0, crq, now).raw).toBe(0);
  });

  it("keeps retention overlap bounded at both ends", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const crq = new Date("2030-01-01T00:00:00Z");
    for (const years of [0, 1, 5, 25, 100]) {
      const value = retentionOverlapRaw(years, crq, now).raw;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("rewards available lead time and zeroes it once overdue", () => {
    expect(leadTimeRaw(0)).toBeGreaterThan(0.7);
    expect(leadTimeRaw(730)).toBe(1);
    expect(leadTimeRaw(-1)).toBe(1);
    expect(leadTimeRaw(-5000)).toBe(1);
  });

  it("counts whole days between dates", () => {
    expect(daysBetween(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-11T00:00:00Z"))).toBe(10);
    expect(daysBetween(new Date("2026-01-11T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(-10);
  });

  it("reserves the published migration lead time", () => {
    expect(MIGRATION_LEAD_DAYS).toBe(1096);
  });
});

describe("post-quantum parameter table", () => {
  it("assigns increasing key sizes within each family", () => {
    for (const family of ["ml-kem", "ml-dsa"] as const) {
      const rows = PQC_PARAMETERS.filter((p) => p.family === family);
      expect(rows.length).toBe(3);
      for (let i = 1; i < rows.length; i += 1) {
        expect(rows[i].publicKeyBytes).toBeGreaterThan(rows[i - 1].publicKeyBytes);
        expect(rows[i].nistLevel).toBeGreaterThan(rows[i - 1].nistLevel);
      }
    }
  });

  it("gives key encapsulation no signature bytes and vice versa", () => {
    for (const row of PQC_PARAMETERS) {
      if (row.family === "ml-kem") {
        expect(row.signatureBytes).toBe(0);
        expect(row.ciphertextBytes).toBeGreaterThan(0);
      } else {
        expect(row.ciphertextBytes).toBe(0);
        expect(row.signatureBytes).toBeGreaterThan(0);
      }
    }
  });
});