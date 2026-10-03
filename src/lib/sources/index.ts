/**
 * Source aggregation.
 *
 * `gatherLive` performs the real measurement. `SEALED_FALLBACK` is a fixed,
 * clearly-labelled sample used only so a first paint or a build never breaks —
 * it is never merged into a user record, and its status is always `fallback`.
 */

import { probeWire, SOURCE_ID as TLS_ID, SOURCE_LABEL as TLS_LABEL, SOURCE_URL as TLS_URL } from "./tls";
import { fetchTransparency, SOURCE_ID as CT_ID, SOURCE_LABEL as CT_LABEL, SOURCE_URL as CT_URL } from "./ct";
import { fetchDnsProfile, fetchSurfaceProfile, DNS_SOURCE_URL, SURFACE_SOURCE_URL } from "./enrich";
import type { HarvestInput, MachineModel } from "../types";

export interface GatheredSources {
  observation: Awaited<ReturnType<typeof probeWire>>;
  transparency: Awaited<ReturnType<typeof fetchTransparency>>;
  dns: Awaited<ReturnType<typeof fetchDnsProfile>>;
  surface: Awaited<ReturnType<typeof fetchSurfaceProfile>>;
}

export class SourceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SourceError";
    this.code = code;
  }
}

/**
 * Measure a host and everything that corroborates it.
 * Throws SourceError when the primary measurement fails; corroboration sources
 * are allowed to be absent, and their absence is reported as null.
 */
export async function gatherLive(host: string): Promise<GatheredSources> {
  let observation: Awaited<ReturnType<typeof probeWire>>;
  try {
    observation = await probeWire(host);
  } catch (error) {
    throw new SourceError(
      "wire_probe_failed",
      error instanceof Error ? error.message : "could not read a certificate from the wire",
    );
  }

  const [transparency, dns] = await Promise.all([
    fetchTransparency(host, observation.spkiSha256),
    fetchDnsProfile(host),
  ]);

  const ip = dns?.addresses.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address)) ?? null;
  const surface = ip ? await fetchSurfaceProfile(ip) : null;

  return { observation, transparency, dns, surface };
}

/**
 * A fixed offline sample so the interface renders before any network call, and
 * so a build never depends on a third party being up.
 */
export const SEALED_FALLBACK: GatheredSources = {
  observation: {
    host: "fallback.invalid",
    subjectCommonName: "Sealed offline sample",
    subjectAlternativeNames: ["fallback.invalid"],
    issuerCommonName: "Shorwatch sealed sample issuer",
    issuerOrganisation: "Shorwatch",
    notBefore: "2025-01-01T00:00:00.000Z",
    notAfter: "2027-01-01T00:00:00.000Z",
    serialNumber: "00",
    spkiSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    certificateSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    protocol: "TLSv1.3",
    cipher: null,
    key: {
      algorithm: "rsa",
      algorithmOid: "1.2.840.113549.1.1.1",
      parameterOid: null,
      parameterLabel: null,
      bits: 2048,
      nistLevel: null,
    },
    hostnameMatched: true,
    source: {
      sourceId: TLS_ID,
      label: TLS_LABEL,
      url: TLS_URL,
      status: "fallback",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      reason: "network measurement unavailable",
    },
  },
  transparency: {
    pubkeySha256: "0000000000000000000000000000000000000000000000000000000000000000",
    firstSeen: "2025-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
    dnsNames: ["fallback.invalid"],
    revoked: false,
    issuanceCount: 0,
    source: {
      sourceId: CT_ID,
      label: CT_LABEL,
      url: CT_URL,
      status: "fallback",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      reason: "network measurement unavailable",
    },
  },
  dns: null,
  surface: null,
};

export function buildEngineInput(
  gathered: GatheredSources,
  retentionYears: number,
  machine: MachineModel,
): HarvestInput {
  return {
    observation: gathered.observation,
    transparency: gathered.transparency,
    dns: gathered.dns,
    surface: gathered.surface,
    retentionYears,
    machine,
  };
}

export { DNS_SOURCE_URL, SURFACE_SOURCE_URL };