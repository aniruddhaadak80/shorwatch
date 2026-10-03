/**
 * Live source 3 — DNS and CAA over DNS-over-HTTPS (Google resolver), and live
 * source 4 — address-level exposure from Shodan InternetDB.
 *
 * CAA matters to a migration plan: it records which authorities may issue for
 * the name, and a hybrid certificate has to come from an authority that can
 * supply the post-quantum key material.
 */

import type { DnsProfile, SurfaceProfile } from "../types";

const DNS_ENDPOINT = "https://dns.google/resolve";
const DNS_TIMEOUT_MS = 8000;
const SURFACE_ENDPOINT = "https://internetdb.shodan.io";
const SURFACE_TIMEOUT_MS = 8000;

export const DNS_SOURCE_ID = "google-doh";
export const DNS_SOURCE_LABEL = "Google Public DNS-over-HTTPS";
export const DNS_SOURCE_URL = "https://developers.google.com/speed/public-dns/docs/doh/json";

export const SURFACE_SOURCE_ID = "shodan-internetdb";
export const SURFACE_SOURCE_LABEL = "Shodan InternetDB";
export const SURFACE_SOURCE_URL = "https://internetdb.shodan.io/";

interface DnsAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

async function resolve(name: string, type: string): Promise<DnsAnswer[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${DNS_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`,
      { signal: controller.signal, headers: { accept: "application/dns-json" }, cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { Answer?: DnsAnswer[] };
    return Array.isArray(body.Answer) ? body.Answer : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDnsProfile(host: string): Promise<DnsProfile | null> {
  const [caa, a, aaaa, mx] = await Promise.all([
    resolve(host, "CAA"),
    resolve(host, "A"),
    resolve(host, "AAAA"),
    resolve(host, "MX"),
  ]);

  const anyAnswer = caa.length + a.length + aaaa.length + mx.length;
  if (anyAnswer === 0) return null;

  const strip = (rows: DnsAnswer[]) =>
    rows.map((row) => (row.data ?? "").replace(/^"|"$/g, ""));

  return {
    host,
    caaAuthorisation: strip(caa),
    addresses: [...strip(a), ...strip(aaaa)],
    mailExchange: strip(mx),
    resolver: "dns.google",
    source: {
      sourceId: DNS_SOURCE_ID,
      label: DNS_SOURCE_LABEL,
      url: DNS_SOURCE_URL,
      status: "live",
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function fetchSurfaceProfile(ip: string): Promise<SurfaceProfile | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SURFACE_TIMEOUT_MS);
  try {
    const response = await fetch(`${SURFACE_ENDPOINT}/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "shorwatch/1.0" },
      cache: "no-store",
    });
    // 404 means Shodan has no record for this address, which is a valid answer.
    if (!response.ok) return null;
    const body = (await response.json()) as {
      ip?: string;
      hostnames?: string[];
      ports?: number[];
      cpes?: string[];
      vulns?: Array<string | { id?: string }>;
      tags?: string[];
    };

    const vulnerabilities = (body.vulns ?? []).map((entry) =>
      typeof entry === "string" ? entry : (entry?.id ?? "unknown"),
    );

    return {
      ip: body.ip ?? ip,
      hostnames: (body.hostnames ?? []).slice(0, 20),
      openPorts: (body.ports ?? []).slice(0, 40).sort((x, y) => x - y),
      vulnerabilities,
      tags: (body.tags ?? []).slice(0, 20),
      source: {
        sourceId: SURFACE_SOURCE_ID,
        label: SURFACE_SOURCE_LABEL,
        url: SURFACE_SOURCE_URL,
        status: "live",
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}