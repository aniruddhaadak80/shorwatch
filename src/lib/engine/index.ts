/**
 * shorwatch-quantum — the one deterministic decision model.
 *
 * This function is the single source of truth for scoring. The UI, the REST
 * endpoint and the MCP tool all call it; no component recomputes a score.
 *
 * score = 100 * sum(weight_i * raw_i) + advisor_adjustment, clamped to 0..100
 *
 * The verdict is derived from the key's algorithm family and its projected CRQ
 * date rather than from score bands, because severity and priority are different
 * questions and a band would conflate them.
 */

import {
  ADVISOR_MAX_ADJUSTMENT,
  ENGINE_NAME,
  ENGINE_VERSION,
  WEIGHTS,
  WEIGHT_SUM,
  type WeightKey,
} from "./constants";
import {
  WEIGHT_LABELS,
  attackSurfaceRaw,
  crqYearForEc,
  crqYearForRsa,
  daysBetween,
  ecClassicalStrength,
  isQuantumSafe,
  isShorBroken,
  leadTimeRaw,
  publicExposureRaw,
  quantumResource,
  rsaClassicalStrength,
  retentionOverlapRaw,
  yearToDate,
} from "./resources";
import { VQC_DESCRIPTION, VQC_WEIGHTS, vqcReadout } from "./vqc";
import { sealEvent, GENESIS_SEAL } from "../integrity/seal";
import type {
  AlgorithmFamily,
  EngineResult,
  Factor,
  HarvestInput,
  MachineModel,
  Verdict,
} from "../types";

export interface EngineOptions {
  /** Fixed clock so tests are reproducible. Defaults to now. */
  now?: Date;
  /**
   * Seed for the advisor's chain position. Kept separate from the clock so a
   * replay of the same record reproduces the same seal.
   */
  sealSeed?: string;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** NIST SP 800-57 security strength by category index 1..5. */
const NIST_CATEGORY_STRENGTH: Record<number, number> = { 1: 80, 2: 128, 3: 192, 4: 256, 5: 256 };

function familyOf(input: HarvestInput): AlgorithmFamily {
  const { algorithmOid, parameterOid } = input.observation.key;
  if (algorithmOid === "1.2.840.113549.1.1.1") return "rsa";
  if (algorithmOid === "1.2.840.10045.2.1") return "ec";
  if (algorithmOid === "1.3.101.112") return "ed25519";
  if (algorithmOid === "1.3.101.113") return "ed448";
  if (algorithmOid === "1.3.101.110") return "x25519";
  if (algorithmOid === "1.3.101.111") return "x448";
  const label = input.observation.key.parameterLabel ?? "";
  if (label.startsWith("ML-DSA")) return "ml-dsa";
  if (label.startsWith("ML-KEM")) return "ml-kem";
  if (label.includes("MLKEM")) return "hybrid";
  void parameterOid;
  return "unknown";
}

/** Bits of classical security the key claims today. */
export function classicalSecurityBits(family: AlgorithmFamily, input: HarvestInput): number {
  if (family === "rsa" && input.observation.key.bits != null) {
    return rsaClassicalStrength(input.observation.key.bits);
  }
  if (family === "ec") {
    return ecClassicalStrength(
      input.observation.key.parameterLabel,
      input.observation.key.bits,
    );
  }
  if (family === "ml-dsa" || family === "ml-kem" || family === "hybrid") {
    const level = input.observation.key.nistLevel;
    if (level == null) return 0;
    return NIST_CATEGORY_STRENGTH[level] ?? 0;
  }
  return 0;
}

/** Projected CRQ year for the given family. */
export function crqYearFor(family: AlgorithmFamily, input: HarvestInput): number {
  if (family === "rsa" && input.observation.key.bits != null) {
    return crqYearForRsa(input.observation.key.bits);
  }
  if (family === "ec") {
    const strength = ecClassicalStrength(
      input.observation.key.parameterLabel,
      input.observation.key.bits,
    );
    return crqYearForEc(strength, input.observation.key.bits ?? 0);
  }
  // EdDSA and X25519 follow their underlying curve; treat as 128-bit-class EC.
  if (family === "ed25519" || family === "ed448" || family === "x25519" || family === "x448") {
    return crqYearForEc(family === "ed448" ? 192 : 128, family === "ed448" ? 448 : 256);
  }
  // Post-quantum families have no projected break date inside the window.
  return Number.POSITIVE_INFINITY;
}

function factor(
  key: WeightKey,
  raw: number,
  detail: string,
): Factor {
  const bounded = clamp(raw, 0, 1);
  // `raw` is published at four decimals and `contribution` is derived from that
  // same published value, so contribution === weight * raw * 100 exactly.
  const published = round4(bounded);
  return {
    key,
    label: WEIGHT_LABELS[key],
    weight: WEIGHTS[key],
    raw: published,
    contribution: round2(WEIGHTS[key] * published * 100),
    detail,
  };
}

/**
 * Score one observed key. Pure: identical input yields an identical result,
 * including the seal.
 */
export function evaluateHarvest(input: HarvestInput, options: EngineOptions = {}): EngineResult {
  const now = options.now ?? new Date();
  const family = familyOf(input);
  const obs = input.observation;
  const machine: MachineModel = input.machine;

  const crqYear = crqYearFor(family, input);
  const crqDate = Number.isFinite(crqYear) ? yearToDate(crqYear) : new Date(Date.UTC(2099, 0, 1));
  const daysToCrq = daysBetween(now, crqDate);

  // --- factor 1: how badly the algorithm itself fails ---
  const quantumWeakness = isShorBroken(family)
    ? 1
    : isQuantumSafe(family)
      ? 0
      : 0.5;
  const weaknessDetail = isShorBroken(family)
    ? `${obs.key.parameterLabel ?? family} is broken by Shor's algorithm; its classical strength does not survive a quantum adversary.`
    : isQuantumSafe(family)
      ? `${obs.key.parameterLabel ?? family} is a post-quantum parameter set and is not known to be efficiently breakable.`
      : "Algorithm family is unrecognised, so no quantum resistance can be claimed.";

  // --- factor 2: how long this exact key has been public ---
  const ct = input.transparency;
  const loggedSince = ct?.firstSeen ?? obs.notBefore;
  const daysPublic = Math.max(0, daysBetween(new Date(loggedSince), now));
  const publicRaw = publicExposureRaw(daysPublic);
  const publicDetail = ct
    ? `This exact SubjectPublicKeyInfo has been in public Certificate Transparency logs since ${loggedSince.slice(0, 10)} (${Math.round(daysPublic)} days).`
    : `No Transparency record was returned for this key, so its certificate start ${obs.notBefore.slice(0, 10)} is used as the earliest public date (${Math.round(daysPublic)} days).`;

  // --- factor 3: does the data outlive the deadline ---
  const retention = retentionOverlapRaw(input.retentionYears, crqDate, now);
  const retentionDetail = Number.isFinite(crqYear)
    ? `Data must stay confidential until ${retention.overlapDate.toISOString().slice(0, 10)}; the projected quantum deadline is ${crqDate.toISOString().slice(0, 10)}.`
    : "The algorithm has no projected quantum deadline inside the model window.";

  // --- factor 4: is there migration time left ---
  const available = daysToCrq - Math.round(3 * 365.25);
  const leadRaw = isShorBroken(family) || isQuantumSafe(family) ? leadTimeRaw(available) : 0.5;
  const leadDetail = Number.isFinite(crqYear)
    ? `${Math.round(available)} days of lead time remain once a ${3}-year migration programme is reserved.`
    : "No migration deadline applies to a post-quantum parameter set.";

  // --- factor 5: co-observed exposure of the same address ---
  const surface = input.surface;
  const surfaceRaw = surface
    ? attackSurfaceRaw(surface.openPorts, surface.vulnerabilities)
    : 0.5;
  const surfaceDetail = surface
    ? `${surface.ip} exposes ${surface.openPorts.length} port(s) and carries ${surface.vulnerabilities.length} known vulnerability tag(s).`
    : "No address-level surface data was available for this host.";

  const factors: Factor[] = [
    factor("quantumWeakness", quantumWeakness, weaknessDetail),
    factor("publicExposure", publicRaw, publicDetail),
    factor("retentionOverlap", retention.raw, retentionDetail),
    factor("leadTime", leadRaw, leadDetail),
    factor("attackSurface", surfaceRaw, surfaceDetail),
  ];

  const weighted = factors.reduce((sum, f) => sum + f.weight * f.raw, 0) / WEIGHT_SUM;
  let score = weighted * 100;

  // --- quantum advisor: an exact-statevector 2-qubit circuit ---
  const readout = vqcReadout(quantumWeakness, publicRaw);
  const adjustment = clamp(readout.adjustment, -ADVISOR_MAX_ADJUSTMENT, ADVISOR_MAX_ADJUSTMENT);
  score = clamp(score + adjustment, 0, 100);

  // --- verdict from algorithm family and deadline, not from score bands ---
  let verdict: Verdict;
  if (isQuantumSafe(family)) {
    verdict = "quantum_viable";
  } else if (!isShorBroken(family)) {
    verdict = "window_closing";
  } else if (daysToCrq - Math.round(3 * 365.25) <= 0) {
    verdict = "harvestable_now";
  } else {
    verdict = "exposed_before_crq";
  }

  const recommendation = buildRecommendation({
    family,
    verdict,
    daysToCrq,
    observation: obs,
    parameterLabel: obs.key.parameterLabel,
  });

  const result: Omit<EngineResult, "seal"> = {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    score: round2(score),
    verdict,
    recommendation,
    factors,
    weights: { ...WEIGHTS },
    crqDate: Number.isFinite(crqYear) ? crqDate.toISOString().slice(0, 10) : "beyond-model-window",
    overlapDate: retention.overlapDate.toISOString().slice(0, 10),
    daysToCrq: Number.isFinite(crqYear) ? daysToCrq : Number.MAX_SAFE_INTEGER,
    leadTimeDays: Number.isFinite(crqYear) ? available : Number.MAX_SAFE_INTEGER,
    quantum:
      family === "rsa" && obs.key.bits != null
        ? quantumResource(obs.key.bits, machine)
        : {
            logicalQubitsNeeded: 0,
            physicalQubitsNeeded: 0,
            budgetFraction: 0,
            anchor: "Not applicable to this algorithm family",
            estimated: false,
          },
    advisor: {
      expectationZ: round2(readout.expectationZ),
      expectationZZ: round2(readout.expectationZZ),
      rawSignal: round2(readout.rawSignal),
      adjustment: round2(adjustment),
      weights: { z: VQC_WEIGHTS.z, zz: VQC_WEIGHTS.zz, bias: VQC_WEIGHTS.bias },
      description: VQC_DESCRIPTION,
    },
    classicalSecurityBits: classicalSecurityBits(family, input),
    evaluatedAt: now.toISOString(),
  };

  const sealed = sealEvent(GENESIS_SEAL, {
    seed: options.sealSeed ?? `${obs.spkiSha256}:${input.retentionYears}:${machine.physicalQubits}`,
    engine: result.engine,
    version: result.version,
    score: result.score,
    verdict: result.verdict,
    crqDate: result.crqDate,
    evaluatedAt: result.evaluatedAt,
    factors: factors.map((f) => ({ key: f.key, raw: f.raw, weight: f.weight })),
  });

  return { ...result, seal: sealed.seal };
}

function buildRecommendation(args: {
  family: AlgorithmFamily;
  verdict: Verdict;
  daysToCrq: number;
  observation: HarvestInput["observation"];
  parameterLabel: string | null;
}): string {
  const label = args.parameterLabel ?? args.family;
  switch (args.verdict) {
    case "quantum_viable":
      return `Hold. ${label} is a post-quantum parameter set; keep it on your rotation schedule and re-check after each NIST revision.`;
    case "harvestable_now":
      return `Act now. ${label} is Shor-broken and the migration window has already closed for this key. Replace it with a hybrid key agreement group and rotate the certificate.`;
    case "window_closing":
      return `Schedule immediately. ${label} is Shor-broken and under ${Math.abs(Math.round(args.daysToCrq))} days of modelled headroom; start the hybrid migration before the window shuts.`;
    default:
      return `Plan the migration. ${label} is Shor-broken and publicly logged, but modelled headroom remains. Move it to a hybrid group and set a deadline.`;
  }
}

export { ENGINE_NAME, ENGINE_VERSION };
export type { Verdict };
export const VERDICT_LABEL: Record<Verdict, string> = {
  harvestable_now: "Harvestable now",
  exposed_before_crq: "Exposed before CRQ",
  window_closing: "Window closing",
  quantum_viable: "Quantum viable",
};