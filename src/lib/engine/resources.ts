/**
 * Explainable quantum resource and CRQ projections.
 *
 * Both models are two-parameter power laws anchored on published values, with
 * every constant imported from `constants.ts` so a reader can recompute any
 * number by hand from the `/standards` route.
 */

import {
  CRQ_ANCHOR_YEAR,
  CRQ_MAX_YEAR,
  CRQ_MIN_YEAR,
  CT_SATURATION_DAYS,
  ECDLP_YEAR_DISCOUNT,
  MIGRATION_LEAD_DAYS,
  NIST_EC_ANCHORS,
  NIST_RSA_ANCHORS,
  SHOR_ANCHOR,
  SURFACE_PORT_SATURATION,
  SURFACE_VULN_WEIGHT,
  YEARS_PER_DOUBLING,
  type WeightKey,
} from "./constants";
import type {
  AlgorithmFamily,
  KeyAlgorithm,
  MachineModel,
  QuantumResource,
} from "../types";

const MS_PER_DAY = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * NIST SP 800-57 comparable classical security for an RSA modulus.
 * Anchors are exact; other sizes interpolate linearly in log2(modulus).
 */
export function rsaClassicalStrength(bits: number): number {
  const anchors = NIST_RSA_ANCHORS;
  if (bits <= anchors[0].bits) return anchors[0].strength;
  if (bits >= anchors[anchors.length - 1].bits) {
    const last = anchors[anchors.length - 1];
    // Extrapolate with the final segment's slope.
    const prev = anchors[anchors.length - 2];
    const slope =
      (last.strength - prev.strength) / (Math.log2(last.bits) - Math.log2(prev.bits));
    return last.strength + slope * (Math.log2(bits) - Math.log2(last.bits));
  }
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const lo = anchors[i];
    const hi = anchors[i + 1];
    if (bits >= lo.bits && bits <= hi.bits) {
      const t = (Math.log2(bits) - Math.log2(lo.bits)) / (Math.log2(hi.bits) - Math.log2(lo.bits));
      return lo.strength + t * (hi.strength - lo.strength);
    }
  }
  return 0;
}

export function ecClassicalStrength(curveLabel: string | null, bits: number | null): number {
  const exact = NIST_EC_ANCHORS.find((c) => c.curve === curveLabel);
  if (exact) return exact.strength;
  if (bits == null) return 0;
  // Fall back to the nearest approved curve by field size.
  let best = NIST_EC_ANCHORS[0];
  for (const c of NIST_EC_ANCHORS) {
    if (Math.abs(c.bits - bits) < Math.abs(best.bits - bits)) best = c;
  }
  return best.strength;
}

/**
 * Families a sufficiently capable quantum adversary breaks outright.
 * Shor's algorithm covers integer factoring and the elliptic-curve discrete log,
 * which is every currently deployed RSA, ECDSA and EdDSA key.
 */
export function isShorBroken(family: AlgorithmFamily): boolean {
  return (
    family === "rsa" ||
    family === "ec" ||
    family === "ed25519" ||
    family === "ed448" ||
    family === "x25519" ||
    family === "x448"
  );
}

export function isQuantumSafe(family: AlgorithmFamily): boolean {
  return family === "ml-dsa" || family === "ml-kem" || family === "hybrid";
}

/**
 * Logical qubits needed to factor an n-bit RSA modulus.
 *
 *   L(n) = L(2048) * (n / 2048) * (log2(n) / 11)
 *
 * Calibrated so that L(2048) is exactly the published 4098.
 */
export function logicalQubitsNeeded(modulusBits: number): number {
  const n = Math.max(256, Math.round(modulusBits));
  const value =
    SHOR_ANCHOR.logicalQubits *
    (n / SHOR_ANCHOR.modulusBits) *
    (Math.log2(n) / Math.log2(SHOR_ANCHOR.modulusBits));
  return Math.round(value);
}

/**
 * Physical qubits implied by a physical error rate.
 *
 * The surface-code distance grows like log2(1/p) and qubits per logical qubit
 * grow like the square of that distance, so the product scales with (d/d0)^2.
 */
/**
 * Surface-code distance for a physical error rate, calibrated so that
 * p = 1e-3 reproduces the code distance 13 used by the published RSA-2048 anchor.
 */
export function codeDistance(physicalErrorRate: number): number {
  const p = Math.min(Math.max(physicalErrorRate, 1e-9), 1e-1);
  const scaled = (SHOR_ANCHOR.codeDistance * Math.log2(1 / p)) / Math.log2(1 / SHOR_ANCHOR.physicalErrorRate);
  return Math.max(3, Math.round(scaled));
}

export function physicalQubitsNeeded(modulusBits: number, physicalErrorRate: number): number {
  const logical = logicalQubitsNeeded(modulusBits);
  const ratio = codeDistance(physicalErrorRate) / SHOR_ANCHOR.codeDistance;
  return Math.round(logical * ratio * ratio * (SHOR_ANCHOR.physicalQubits / SHOR_ANCHOR.logicalQubits));
}

export function quantumResource(modulusBits: number, machine: MachineModel): QuantumResource {
  const logicalNeeded = logicalQubitsNeeded(modulusBits);
  const physicalNeeded = physicalQubitsNeeded(modulusBits, machine.physicalErrorRate);
  return {
    logicalQubitsNeeded: logicalNeeded,
    physicalQubitsNeeded: physicalNeeded,
    budgetFraction: machine.physicalQubits > 0 ? physicalNeeded / machine.physicalQubits : 0,
    anchor: `${SHOR_ANCHOR.citation}: ${SHOR_ANCHOR.logicalQubits} logical qubits for RSA-${SHOR_ANCHOR.modulusBits}`,
    estimated: true,
  };
}

/**
 * Projected calendar year in which a cryptographically relevant quantum
 * computer breaks this key.
 *
 *   crqYear(n) = 2035 + 7.7 * log2(n / 2048)
 *
 * Elliptic-curve keys are converted to an RSA modulus of equal NIST strength and
 * then discounted by ECDLP_YEAR_DISCOUNT, because the quantum discrete-log attack
 * is cheaper than factoring at the same claimed security level.
 */
export function crqYearForRsa(modulusBits: number): number {
  const raw =
    CRQ_ANCHOR_YEAR + YEARS_PER_DOUBLING * (Math.log2(Math.max(256, modulusBits)) - Math.log2(2048));
  return clampYear(raw);
}

export function crqYearForEc(strengthBits: number, curveBits: number): number {
  // Find the RSA modulus NIST considers equivalent to this curve's strength.
  let modulus = 2048;
  for (const anchor of NIST_RSA_ANCHORS) {
    if (anchor.strength <= strengthBits) modulus = anchor.bits;
  }
  const base = crqYearForRsa(modulus);
  const offset = (base - CRQ_ANCHOR_YEAR) * ECDLP_YEAR_DISCOUNT;
  // Very large curves get a small extra penalty for the sheer key size.
  const sizePenalty = curveBits > 521 ? 1 : 0;
  return clampYear(CRQ_ANCHOR_YEAR + offset + sizePenalty);
}

function clampYear(value: number): number {
  const rounded = Math.round(value);
  return Math.min(CRQ_MAX_YEAR, Math.max(CRQ_MIN_YEAR, rounded));
}

export function yearToDate(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

/** Lead time in days still available before migration must already be underway. */
export function leadTimeDays(crqDate: Date, now: Date): number {
  return daysBetween(now, crqDate) - MIGRATION_LEAD_DAYS;
}

/** Saturating measure of how long the exact public key has been publicly logged. */
export function publicExposureRaw(daysSinceLogged: number): number {
  // NaN means "unknown", which must not read as either extreme.
  if (Number.isNaN(daysSinceLogged)) return 0;
  if (daysSinceLogged <= 0) return 0;
  const saturateDays = CT_SATURATION_DAYS;
  if (daysSinceLogged === Number.POSITIVE_INFINITY) return 1;
  return Math.min(1, daysSinceLogged / saturateDays);
}

/** 1 when the confidentiality requirement outlasts the CRQ date, easing to 0. */
export function retentionOverlapRaw(
  retentionYears: number,
  crqDate: Date,
  now: Date,
): { raw: number; overlapDate: Date } {
  const requirement = new Date(
    now.getTime() + retentionYears * 365.25 * MS_PER_DAY,
  );
  if (requirement <= crqDate) {
    const span = Math.max(1, daysBetween(now, crqDate));
    const past = daysBetween(crqDate, requirement);
    return { raw: Math.max(0, Math.min(1, past / span)), overlapDate: requirement };
  }
  // The requirement outlives the deadline, so the factor saturates.
  return { raw: 1, overlapDate: requirement };
}

/** Lead-time factor: 1 while comfortable, 0 once the window has closed. */
export function leadTimeRaw(daysAvailable: number): number {
  if (daysAvailable >= 0) {
    // Full credit for a year of slack, tapering to 0.8 credit at the boundary.
    return Math.min(1, 0.8 + daysAvailable / 365);
  }
  return 1;
}

/** Normalised co-observed internet exposure for the same address. */
export function attackSurfaceRaw(openPorts: number[], vulnerabilities: string[]): number {
  const portScore = Math.min(1, openPorts.length / SURFACE_PORT_SATURATION);
  const vulnScore = Math.min(1, vulnerabilities.length / 3);
  return Math.min(1, portScore * (1 - SURFACE_VULN_WEIGHT) + vulnScore * SURFACE_VULN_WEIGHT);
}

export const WEIGHT_LABELS: Record<WeightKey, string> = {
  quantumWeakness: "Quantum weakness",
  publicExposure: "Public exposure",
  retentionOverlap: "Retention overlap",
  leadTime: "Migration lead time",
  attackSurface: "Attack surface",
};

export const ALGORITHM_LABEL: Record<KeyAlgorithm, string> = {
  rsa: "RSA",
  ec: "Elliptic curve",
  ed25519: "Ed25519",
  ed448: "Ed448",
  x25519: "X25519",
  x448: "X448",
  "ml-dsa": "ML-DSA",
  "ml-kem": "ML-KEM",
  hybrid: "Hybrid",
  unknown: "Unknown",
};