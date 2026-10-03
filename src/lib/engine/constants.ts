/**
 * Every constant the engine uses, in one published place.
 *
 * Nothing here is tuned to make a demo look good. Anchors are either from a
 * standard (NIST FIPS 180-4 / SP 800-57) or from a cited resource estimate, and
 * each carries its source so the `/standards` route can render it verbatim.
 */

export interface Anchor {
  id: string;
  label: string;
  value: string;
  source: string;
  sourceUrl: string;
}

export const ENGINE_NAME = "shorwatch-quantum";
export const ENGINE_VERSION = "1.0.0";

/** NIST SP 800-57 Part 1 Rev. 5, Table 2 — comparable classical security. */
export const NIST_RSA_ANCHORS: ReadonlyArray<{ bits: number; strength: number }> = [
  { bits: 1024, strength: 80 },
  { bits: 2048, strength: 112 },
  { bits: 3072, strength: 128 },
  { bits: 4096, strength: 152 },
];

/** NIST FIPS 186-5 approved curves, with SP 800-57 security strength. */
export const NIST_EC_ANCHORS: ReadonlyArray<{ curve: string; bits: number; strength: number }> = [
  { curve: "P-224", bits: 224, strength: 128 },
  { curve: "P-256", bits: 256, strength: 128 },
  { curve: "P-384", bits: 384, strength: 192 },
  { curve: "P-521", bits: 521, strength: 256 },
];

/** Post-quantum parameter sets, with their NIST security category. */
export const PQC_PARAMETERS: ReadonlyArray<{
  label: string;
  family: "ml-kem" | "ml-dsa";
  nistLevel: number;
  publicKeyBytes: number;
  secretKeyBytes: number;
  ciphertextBytes: number;
  signatureBytes: number;
  standard: string;
}> = [
  {
    label: "ML-KEM-512",
    family: "ml-kem",
    nistLevel: 1,
    publicKeyBytes: 800,
    secretKeyBytes: 1632,
    ciphertextBytes: 768,
    signatureBytes: 0,
    standard: "FIPS 203",
  },
  {
    label: "ML-KEM-768",
    family: "ml-kem",
    nistLevel: 3,
    publicKeyBytes: 1184,
    secretKeyBytes: 2400,
    ciphertextBytes: 1088,
    signatureBytes: 0,
    standard: "FIPS 203",
  },
  {
    label: "ML-KEM-1024",
    family: "ml-kem",
    nistLevel: 5,
    publicKeyBytes: 1568,
    secretKeyBytes: 3168,
    ciphertextBytes: 1568,
    signatureBytes: 0,
    standard: "FIPS 203",
  },
  {
    label: "ML-DSA-44",
    family: "ml-dsa",
    nistLevel: 2,
    publicKeyBytes: 1312,
    secretKeyBytes: 2560,
    ciphertextBytes: 0,
    signatureBytes: 2420,
    standard: "FIPS 204",
  },
  {
    label: "ML-DSA-65",
    family: "ml-dsa",
    nistLevel: 3,
    publicKeyBytes: 1952,
    secretKeyBytes: 4032,
    ciphertextBytes: 0,
    signatureBytes: 3309,
    standard: "FIPS 204",
  },
  {
    label: "ML-DSA-87",
    family: "ml-dsa",
    nistLevel: 5,
    publicKeyBytes: 2592,
    secretKeyBytes: 4896,
    ciphertextBytes: 0,
    signatureBytes: 4627,
    standard: "FIPS 204",
  },
];

/**
 * Resource anchor used to calibrate the factoring curve.
 * Gidney & Eakerå, "How to factor 2048 bit RSA integers in 8 hours using
 * 20 million noisy qubits", Quantum 5, 433 (2019).
 */
export const SHOR_ANCHOR = {
  modulusBits: 2048,
  logicalQubits: 4098,
  physicalQubits: 20_000_000,
  physicalErrorRate: 1e-3,
  codeDistance: 13,
  hours: 8,
  citation: "Gidney & Eakerå, Quantum 5, 433 (2019)",
  citationUrl: "https://quantum-journal.org/papers/q-2019-04-15-433/",
} as const;

/**
 * CRQ projection. `yearsPerDoubling` is the number of calendar years by which
 * the projected arrival of a factoring-capable machine moves each time the RSA
 * modulus doubles. It is derived from the anchor: reaching the ~50x physical
 * qubit count generally quoted for RSA-4096 at roughly 8x per year of device
 * growth is about 7.7 years per doubling.
 */
export const CRQ_ANCHOR_YEAR = 2035;
export const YEARS_PER_DOUBLING = 7.7;
/** ECDLP admits a materially cheaper quantum attack than factoring at equal
 *  NIST strength, so elliptic-curve keys break sooner. Published discount. */
export const ECDLP_YEAR_DISCOUNT = 0.75;
export const CRQ_MIN_YEAR = 2028;
export const CRQ_MAX_YEAR = 2060;

/** Years of lead time a PQC migration programme is generally assumed to need. */
export const MIGRATION_LEAD_YEARS = 3;
export const MIGRATION_LEAD_DAYS = Math.round(MIGRATION_LEAD_YEARS * 365.25);

/** Days of public CT exposure after which the factor saturates. */
export const CT_SATURATION_DAYS = 5 * 365.25;

/** Weight table. Sums to exactly 1. */
export const WEIGHTS = {
  /** How badly the algorithm itself fails against a quantum adversary. */
  quantumWeakness: 0.3,
  /** How long this exact public key has been sitting in public logs. */
  publicExposure: 0.22,
  /** Whether the confidentiality requirement outlasts the CRQ date. */
  retentionOverlap: 0.2,
  /** Whether migration lead time is still available. */
  leadTime: 0.16,
  /** Co-observed internet exposure of the same address. */
  attackSurface: 0.12,
} as const;

export type WeightKey = keyof typeof WEIGHTS;

export const WEIGHT_SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

/** Maximum absolute score change the quantum advisor may apply. */
export const ADVISOR_MAX_ADJUSTMENT = 3.5;

/** Surface-risk normalisation: ports beyond this count saturate the factor. */
export const SURFACE_PORT_SATURATION = 12;
export const SURFACE_VULN_WEIGHT = 0.35;

export const ANCHORS: readonly Anchor[] = [
  {
    id: "nist-rsa",
    label: "RSA comparable security",
    value: "1024→80, 2048→112, 3072→128, 4096→152 bits",
    source: "NIST SP 800-57 Part 1 Rev. 5, Table 2",
    sourceUrl: "https://csrc.nist.gov/publications/detail/sp/800-57/part1/final",
  },
  {
    id: "nist-ec",
    label: "Approved curve security",
    value: "P-224/P-256→128, P-384→192, P-521→256 bits",
    source: "NIST FIPS 186-5 and SP 800-57 Part 1 Rev. 5",
    sourceUrl: "https://csrc.nist.gov/pubs/fips/186-5/final",
  },
  {
    id: "fips-203",
    label: "ML-KEM parameter sets",
    value: "ML-KEM-512 / 768 / 1024 at NIST levels 1 / 3 / 5",
    source: "NIST FIPS 203 (ML-KEM)",
    sourceUrl: "https://csrc.nist.gov/pubs/fips/203/final",
  },
  {
    id: "fips-204",
    label: "ML-DSA parameter sets",
    value: "ML-DSA-44 / 65 / 87 at NIST levels 2 / 3 / 5",
    source: "NIST FIPS 204 (ML-DSA)",
    sourceUrl: "https://csrc.nist.gov/pubs/fips/204/final",
  },
  {
    id: "shor-anchor",
    label: "RSA-2048 factoring anchor",
    value: `${SHOR_ANCHOR.logicalQubits} logical / ~${SHOR_ANCHOR.physicalQubits.toLocaleString("en-US")} physical qubits in ${SHOR_ANCHOR.hours} h`,
    source: SHOR_ANCHOR.citation,
    sourceUrl: SHOR_ANCHOR.citationUrl,
  },
  {
    id: "crq-window",
    label: "CRQ projection basis",
    value: `${CRQ_ANCHOR_YEAR} for RSA-2048, ${YEARS_PER_DOUBLING} years per modulus doubling`,
    source: "Interpolation anchored on the published RSA-2048 estimate above",
    sourceUrl: SHOR_ANCHOR.citationUrl,
  },
  {
    id: "migration-lead",
    label: "Migration lead time assumption",
    value: `${MIGRATION_LEAD_YEARS} years`,
    source: "Assumption published by Shorwatch; adjustable per watch",
    sourceUrl: "https://csrc.nist.gov/projects/post-quantum-cryptography",
  },
];

export const DISCLAIMER =
  "Shorwatch reports measured facts and an explicitly published model. The cryptographically-relevant-quantum date is an order-of-magnitude educational projection, not a forecast, and nothing here is security advice. Validate every migration decision with your own cryptographic review and current standards guidance.";