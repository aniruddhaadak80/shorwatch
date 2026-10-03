/**
 * Normalised types for external sources and the persisted domain model.
 *
 * Every externally fetched record carries attribution, the upstream identifier,
 * the moment it was fetched and an explicit `live | fallback` status so a sealed
 * offline sample is never presented as current.
 */

export type SourceStatus = "live" | "fallback";

export interface SourceAttribution {
  /** Stable identifier of the upstream feed, e.g. `certspotter-ct`. */
  sourceId: string;
  /** Human label for the UI. */
  label: string;
  /** Canonical URL a reader can verify the claim against. */
  url: string;
  status: SourceStatus;
  /** ISO-8601 UTC timestamp of when this payload was produced. */
  fetchedAt: string;
  /** Present only when status is `fallback`. */
  reason?: string;
}

export type KeyAlgorithm =
  | "rsa"
  | "ec"
  | "ed25519"
  | "ed448"
  | "x25519"
  | "x448"
  | "ml-dsa"
  | "ml-kem"
  | "hybrid"
  | "unknown";

/** Alias used by the engine to reason about quantum resistance. */
export type AlgorithmFamily = KeyAlgorithm;

export interface AlgorithmInfo {
  algorithm: KeyAlgorithm;
  /** Algorithm OID exactly as it appeared in the DER SubjectPublicKeyInfo. */
  algorithmOid: string;
  /** Curve / parameter-set OID when the algorithm carries one. */
  parameterOid: string | null;
  /** Human label for the parameter set, e.g. `P-256`, `ML-DSA-65`. */
  parameterLabel: string | null;
  /** RSA modulus size or EC field size in bits. Null when not applicable. */
  bits: number | null;
  /** NIST security category 1-5 when the algorithm maps to one. */
  nistLevel: number | null;
}

/** A certificate measured directly off the TLS wire. */
export interface WireObservation {
  host: string;
  subjectCommonName: string;
  subjectAlternativeNames: string[];
  issuerCommonName: string;
  issuerOrganisation: string | null;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  /** Lowercase hex SHA-256 of the DER SubjectPublicKeyInfo. */
  spkiSha256: string;
  /** Lowercase hex SHA-256 of the whole DER certificate. */
  certificateSha256: string;
  /** Negotiated TLS protocol and cipher from the same handshake. */
  protocol: string | null;
  cipher: string | null;
  key: AlgorithmInfo;
  /** True when at least one presented name matches the queried host. */
  hostnameMatched: boolean;
  source: SourceAttribution;
}

/** Corroboration from Certificate Transparency about this exact public key. */
export interface TransparencyRecord {
  /** SPKI fingerprint the log recorded. */
  pubkeySha256: string;
  /** ISO date the key was first seen publicly logged. */
  firstSeen: string;
  /** ISO date the logged certificate stops being valid. */
  validUntil: string;
  dnsNames: string[];
  /** True when a Certificate Transparency record reported the certificate revoked. */
  revoked: boolean;
  /** Number of issuances returned for the queried scope. */
  issuanceCount: number;
  source: SourceAttribution;
}

export interface DnsRecord {
  type: string;
  value: string;
  ttl: number;
}

export interface DnsProfile {
  host: string;
  caaAuthorisation: string[];
  addresses: string[];
  mailExchange: string[];
  /** Resolver that answered, for attribution. */
  resolver: string;
  source: SourceAttribution;
}

export interface SurfaceProfile {
  ip: string;
  hostnames: string[];
  openPorts: number[];
  /** Vulnerability tags reported for the address, empty when none are known. */
  vulnerabilities: string[];
  tags: string[];
  source: SourceAttribution;
}

/** Everything the engine needs for one host, gathered from the live sources. */
export interface HarvestInput {
  observation: WireObservation;
  transparency: TransparencyRecord | null;
  dns: DnsProfile | null;
  surface: SurfaceProfile | null;
  /** How long the data behind this host must stay confidential, in years. */
  retentionYears: number;
  /** Assumed physical-qubit budget of the future adversary, for the resource curve. */
  machine: MachineModel;
}

export interface MachineModel {
  /** Logical qubits assumed available to the factoring run. */
  logicalQubits: number;
  /** Physical error rate, e.g. 1e-3 for a superconducting device. */
  physicalErrorRate: number;
  /** Physical qubits assumed deployed. */
  physicalQubits: number;
}

export const DEFAULT_MACHINE: MachineModel = {
  logicalQubits: 4000,
  physicalErrorRate: 1e-3,
  physicalQubits: 20_000_000,
};

export type Decision = "undecided" | "rotate_now" | "hybrid_migrate" | "accept_monitor";

export const DECISIONS: readonly Decision[] = [
  "undecided",
  "rotate_now",
  "hybrid_migrate",
  "accept_monitor",
] as const;

export interface Factor {
  key: string;
  label: string;
  weight: number;
  /** Normalised 0..1 raw value before weighting. */
  raw: number;
  /** weight * raw * 100. */
  contribution: number;
  /** The measured quantity and the comparison that produced `raw`. */
  detail: string;
}

export type Verdict =
  | "harvestable_now"
  | "exposed_before_crq"
  | "window_closing"
  | "quantum_viable";

export interface QuantumResource {
  /** Published-anchor interpolation of logical qubits needed to factor the modulus. */
  logicalQubitsNeeded: number;
  /** Physical qubits implied by the assumed error rate. */
  physicalQubitsNeeded: number;
  /** Fraction of the assumed machine budget required, 0..1+. */
  budgetFraction: number;
  /** Anchor the interpolation was calibrated against. */
  anchor: string;
  /** True when the estimate came from an order-of-magnitude model rather than measurement. */
  estimated: boolean;
}

export interface VqcAdvisor {
  /** Exact-statevector expectation values, no sampling noise. */
  expectationZ: number;
  expectationZZ: number;
  /** Frozen linear combination of the two expectations, bounded to -1..1. */
  rawSignal: number;
  /** Bounded adjustment applied to the harvest score. */
  adjustment: number;
  weights: { z: number; zz: number; bias: number };
  description: string;
}

export interface EngineResult {
  engine: string;
  version: string;
  score: number;
  verdict: Verdict;
  recommendation: string;
  factors: Factor[];
  weights: Record<string, number>;
  /** Estimated date a cryptographically relevant quantum computer breaks this key. */
  crqDate: string;
  /** ISO date the confidentiality requirement outlasts the CRQ date. */
  overlapDate: string;
  /** Whole days between today and the CRQ date; negative when already broken. */
  daysToCrq: number;
  /** Whole days of migration lead time still available, negative when overdue. */
  leadTimeDays: number;
  quantum: QuantumResource;
  advisor: VqcAdvisor;
  classicalSecurityBits: number;
  /** Lowercase hex SHA-384 seal over the canonical form of this result. */
  seal: string;
  /** When the inputs were gathered. */
  evaluatedAt: string;
}

export interface KeyObservation extends WireObservation {
  id: string;
  watchId: string;
  transparency: TransparencyRecord | null;
  dns: DnsProfile | null;
  surface: SurfaceProfile | null;
  engine: EngineResult;
  createdAt: string;
}

export interface AuditEvent {
  seq: number;
  entityId: string;
  action: string;
  at: string;
  payload: Record<string, unknown>;
  prevSeal: string;
  seal: string;
}

export interface Watch {
  id: string;
  ownerId: string;
  host: string;
  label: string;
  retentionYears: number;
  machine: MachineModel;
  decision: Decision;
  notes: string;
  /** True when the most recent probe came from the live wire. */
  live: boolean;
  lastProbedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Present on list responses only. */
  summary?: WatchSummary;
}

export interface WatchSummary {
  observationCount: number;
  worstVerdict: Verdict;
  worstScore: number;
  exposedKeyCount: number;
  daysToCrq: number | null;
  spkiSha256: string | null;
  algorithmLabel: string | null;
}

export interface Settings {
  ownerId: string;
  retentionYears: number;
  machine: MachineModel;
  updatedAt: string;
}