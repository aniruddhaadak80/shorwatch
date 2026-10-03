/**
 * Live source 1 — the certificate the server is actually serving.
 *
 * This is a real TLS handshake performed with `node:tls` against the target on
 * port 443. Nothing about the key is self-reported: the DER bytes come off the
 * socket and the SubjectPublicKeyInfo is parsed from them. One connection
 * yields both the raw DER (for key material) and node's decoded view of the same
 * certificate (for names and validity).
 */

import { connect, type ConnectionOptions, type TLSSocket } from "node:tls";
import { createHash } from "node:crypto";
import {
  algorithmFamilyFor,
  parameterLabelFor,
  parseCertificateSpki,
} from "../der";
import { PQC_PARAMETERS } from "../engine/constants";
import type { AlgorithmInfo, WireObservation } from "../types";

export const SOURCE_ID = "tls-wire";
export const SOURCE_LABEL = "Live TLS handshake";
export const SOURCE_URL = "https://nodejs.org/api/tls.html#tlsconnectoptions-callback";

const TIMEOUT_MS = 12_000;

interface CertificateFacts {
  raw: Buffer;
  protocol: string | null;
  cipher: string | null;
  subjectCommonName: string;
  subjectAlternativeNames: string[];
  issuerCommonName: string;
  issuerOrganisation: string | null;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
}

function connectOnce(host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const options: ConnectionOptions = {
      host,
      port: 443,
      servername: host,
      // We inspect the key material; issuer trust is not what this source measures.
      rejectUnauthorized: false,
      timeout: TIMEOUT_MS,
    };
    const socket = connect(options);

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(message));
    };

    socket.once("secureConnect", () => {
      if (settled) return;
      settled = true;
      resolve(socket);
    });
    socket.once("timeout", () => fail(`handshake with ${host} timed out`));
    socket.once("error", (error) => fail(`TLS handshake with ${host} failed: ${error.message}`));
  });
}

function nistLevelFor(label: string | null): number | null {
  if (!label) return null;
  return PQC_PARAMETERS.find((p) => p.label === label)?.nistLevel ?? null;
}

function ecBits(parameterOid: string | null): number | null {
  switch (parameterOid) {
    case "1.2.840.10045.3.1.7":
      return 256;
    case "1.3.132.0.34":
      return 384;
    case "1.3.132.0.35":
      return 521;
    case "1.3.132.0.10":
      return 256;
    default:
      return null;
  }
}

function matchesHost(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase().replace(/\.$/, "");
  const h = host.toLowerCase().replace(/\.$/, "");
  if (p === h) return true;
  if (p.startsWith("*.")) {
    return h.endsWith(p.slice(1)) && h.split(".").length === p.split(".").length;
  }
  return false;
}

/**
 * Probe a host's live certificate. Throws when the host cannot be reached, which
 * the caller surfaces as an honest failure rather than substituting fallback data.
 */
export async function probeWire(host: string): Promise<WireObservation> {
  const socket = await connectOnce(host);
  let facts: CertificateFacts;
  try {
    const cert = socket.getPeerCertificate(false) as unknown as Record<string, unknown> | undefined;
    if (!cert || !cert.raw) {
      throw new Error(`${host} completed a handshake but presented no certificate`);
    }
    const cipher = socket.getCipher();
    const subject = (cert.subject ?? {}) as Record<string, string[] | undefined>;
    const issuer = (cert.issuer ?? {}) as Record<string, string[] | undefined>;
    const sanRaw = typeof cert.subjectaltname === "string" ? cert.subjectaltname : "";

    facts = {
      raw: cert.raw as Buffer,
      protocol: socket.getProtocol() ?? null,
      cipher: cipher ? cipher.name : null,
      subjectCommonName: subject.CN?.[0] ?? host,
      subjectAlternativeNames: sanRaw
        .split(",")
        .map((value) => value.trim().replace(/^DNS:/i, ""))
        .filter(Boolean),
      issuerCommonName: issuer.CN?.[0] ?? "unknown issuer",
      issuerOrganisation: issuer.O?.[0] ?? null,
      notBefore: toIso(cert.valid_from),
      notAfter: toIso(cert.valid_to),
      serialNumber: String(cert.serialNumber ?? "unknown"),
    };
  } finally {
    socket.destroy();
  }

  const spki = parseCertificateSpki(facts.raw);
  const family = algorithmFamilyFor(spki.algorithmOid, spki.parameterOid);
  const parameterLabel = parameterLabelFor(spki.parameterOid);

  const key: AlgorithmInfo = {
    algorithm: family,
    algorithmOid: spki.algorithmOid,
    parameterOid: spki.parameterOid,
    parameterLabel,
    bits: spki.rsaBits ?? ecBits(spki.parameterOid),
    nistLevel: nistLevelFor(parameterLabel),
  };

  const names = facts.subjectAlternativeNames.length
    ? facts.subjectAlternativeNames
    : [facts.subjectCommonName];

  return {
    host,
    subjectCommonName: facts.subjectCommonName,
    subjectAlternativeNames: names,
    issuerCommonName: facts.issuerCommonName,
    issuerOrganisation: facts.issuerOrganisation,
    notBefore: facts.notBefore,
    notAfter: facts.notAfter,
    serialNumber: facts.serialNumber,
    spkiSha256: spki.spkiSha256,
    certificateSha256: createHash("sha256").update(facts.raw).digest("hex"),
    protocol: facts.protocol,
    cipher: facts.cipher,
    key,
    hostnameMatched: names.some((name) => matchesHost(name, host)),
    source: {
      sourceId: SOURCE_ID,
      label: SOURCE_LABEL,
      url: SOURCE_URL,
      status: "live",
      fetchedAt: new Date().toISOString(),
    },
  };
}

function toIso(value: unknown): string {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}