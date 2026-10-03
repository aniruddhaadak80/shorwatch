/**
 * Live source 2 — Certificate Transparency corroboration.
 *
 * Cert Spotter's issuance API is keyless. It returns the SHA-256 fingerprint of
 * each issuance's SubjectPublicKeyInfo, which lets Shorwatch answer the question
 * a TLS probe alone cannot: since when has this exact public key been public?
 */

import type { SourceAttribution, TransparencyRecord } from "../types";

export const SOURCE_ID = "certspotter-ct";
export const SOURCE_LABEL = "Cert Spotter CT issuances";
export const SOURCE_URL = "https://sslmate.com/certspotter/api/";
const ENDPOINT = "https://api.certspotter.com/v1/issuances";
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;

interface Issuance {
  id?: string;
  pubkey_sha256?: string;
  not_before?: string;
  not_after?: string;
  dns_names?: string[];
  revoked?: boolean;
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "shorwatch/1.0" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`upstream responded ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Look for the exact public key observed on the wire among public CT issuances.
 * Returns null when the feed is unreachable; never fabricates a match.
 */
export async function fetchTransparency(
  host: string,
  spkiSha256: string,
): Promise<TransparencyRecord | null> {
  const url = `${ENDPOINT}?domain=${encodeURIComponent(host)}&include_subdomains=false&match_wildcards=true&expand=dns_names`;
  const source: SourceAttribution = {
    sourceId: SOURCE_ID,
    label: SOURCE_LABEL,
    url: SOURCE_URL,
    status: "live",
    fetchedAt: new Date().toISOString(),
  };

  let payload: Issuance[];
  try {
    payload = (await fetchJson(url)) as Issuance[];
  } catch {
    return null;
  }
  if (!Array.isArray(payload)) return null;

  const matching = payload.filter((entry) => entry.pubkey_sha256 === spkiSha256);
  if (matching.length === 0) {
    return {
      pubkeySha256: spkiSha256,
      firstSeen: new Date(0).toISOString(),
      validUntil: new Date(0).toISOString(),
      dnsNames: [],
      revoked: false,
      issuanceCount: payload.length,
      source: { ...source, reason: "no issuance for this key was returned" },
    };
  }

  const firstSeen = matching
    .map((entry) => entry.not_before)
    .filter((value): value is string => typeof value === "string")
    .sort()[0];
  const validUntil = matching
    .map((entry) => entry.not_after)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .pop();

  const dnsNames = Array.from(
    new Set(matching.flatMap((entry) => entry.dns_names ?? [])),
  ).slice(0, 40);

  return {
    pubkeySha256: spkiSha256,
    firstSeen: firstSeen ? new Date(firstSeen).toISOString() : new Date(0).toISOString(),
    validUntil: validUntil ? new Date(validUntil).toISOString() : new Date(0).toISOString(),
    dnsNames,
    revoked: matching.some((entry) => entry.revoked === true),
    issuanceCount: payload.length,
    source,
  };
}