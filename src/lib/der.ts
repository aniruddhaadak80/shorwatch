/**
 * A deliberately small DER reader, scoped to exactly what Shorwatch needs from a
 * certificate: the SubjectPublicKeyInfo algorithm OIDs, the RSA modulus size,
 * and the SPKI bytes themselves.
 *
 * Two invariants this module must not break, both covered by tests:
 *   1. The SPKI slice runs from the SEQUENCE's own tag byte through its final
 *      content byte. Slicing only the contents omits the 2-4 byte TLV header and
 *      produces a fingerprint that matches nothing.
 *   2. An RSA public key is SEQUENCE { INTEGER modulus, INTEGER exponent } nested
 *      inside a BIT STRING. Reading the BIT STRING contents once yields the outer
 *      SEQUENCE, not the modulus, which inflates the reported bit length.
 */

import { createHash, createPublicKey } from "node:crypto";

export interface Tlv {
  /** Offset of the tag byte. */
  hdr: number;
  /** Offset of the first content byte. */
  start: number;
  /** Content length in bytes. */
  len: number;
  /** Offset one past the final content byte. */
  end: number;
  tag: number;
  next: number;
}

const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_OID = 0x06;
const TAG_SEQUENCE = 0x30;

export function readTlv(buf: Buffer, offset: number): Tlv {
  if (offset >= buf.length) throw new Error("DER: read past end of buffer");
  const hdr = offset;
  const tag = buf[hdr];
  let cursor = hdr + 1;
  let len = buf[cursor++];
  if ((len & 0x80) !== 0) {
    const count = len & 0x7f;
    if (count === 0 || count > 4) throw new Error("DER: unsupported length encoding");
    len = 0;
    for (let i = 0; i < count; i += 1) len = len * 256 + buf[cursor++];
  }
  return { hdr, start: cursor, len, end: cursor + len, tag, next: cursor + len };
}

function children(buf: Buffer, start: number, end: number): Tlv[] {
  const out: Tlv[] = [];
  let cursor = start;
  while (cursor < end) {
    const tlv = readTlv(buf, cursor);
    out.push(tlv);
    cursor = tlv.next;
  }
  return out;
}

/** Decode an OBJECT IDENTIFIER's content octets into dotted-decimal form. */
export function decodeOid(content: Buffer): string {
  if (content.length === 0) throw new Error("DER: empty OID");
  const parts: number[] = [Math.floor(content[0] / 40), content[0] % 40];
  let value = 0n;
  for (let i = 1; i < content.length; i += 1) {
    value = (value << 7n) | BigInt(content[i] & 0x7f);
    if ((content[i] & 0x80) === 0) {
      parts.push(Number(value));
      value = 0n;
    }
  }
  return parts.join(".");
}

export interface ParsedSubjectPublicKeyInfo {
  algorithmOid: string;
  parameterOid: string | null;
  rsaBits: number | null;
  /** Full DER SubjectPublicKeyInfo, TLV header included. */
  spkiDer: Buffer;
  spkiSha256: string;
}

/**
 * Extract the SubjectPublicKeyInfo from a DER certificate.
 *
 * TBSCertificate fields, in order, after the optional [0] EXPLICIT version:
 * serialNumber, signature, issuer, validity, subject, subjectPublicKeyInfo.
 * subjectPublicKeyInfo is therefore index 6 when a version tag is present and 5
 * when it is absent, so it is located by scanning for the first SEQUENCE whose
 * own contents begin with a SEQUENCE followed by a BIT STRING.
 */
export function parseCertificateSpki(der: Buffer): ParsedSubjectPublicKeyInfo {
  const certificate = readTlv(der, 0);
  if (certificate.tag !== TAG_SEQUENCE) throw new Error("DER: certificate is not a SEQUENCE");
  const tbs = readTlv(der, certificate.start);
  if (tbs.tag !== TAG_SEQUENCE) throw new Error("DER: tbsCertificate is not a SEQUENCE");

  const spki = children(der, tbs.start, tbs.end).find((tlv) => {
    if (tlv.tag !== TAG_SEQUENCE) return false;
    try {
      const alg = readTlv(der, tlv.start);
      const bits = readTlv(der, alg.next);
      return alg.tag === TAG_SEQUENCE && bits.tag === TAG_BIT_STRING;
    } catch {
      return false;
    }
  });
  if (!spki) throw new Error("DER: no SubjectPublicKeyInfo found");

  const algId = readTlv(der, spki.start);
  const bitString = readTlv(der, algId.next);
  const algParts = children(der, algId.start, algId.end);
  const algorithmOid = decodeOid(der.subarray(algParts[0].start, algParts[0].end));
  const parameterOid =
    algParts[1] && algParts[1].tag === TAG_OID
      ? decodeOid(der.subarray(algParts[1].start, algParts[1].end))
      : null;

  let rsaBits: number | null = null;
  if (algorithmOid === OID.rsaEncryption) {
    // BIT STRING content is prefixed by one unused-bits octet.
    const rsaKey = children(der, bitString.start + 1, bitString.end)[0];
    const modulus = readTlv(der, rsaKey.start);
    if (modulus.tag !== TAG_INTEGER) throw new Error("DER: RSA modulus is not an INTEGER");
    // Strip any leading zero octet added to keep the INTEGER positive.
    let first = modulus.start;
    while (first < modulus.end - 1 && der[first] === 0) first += 1;
    rsaBits = (modulus.end - first) * 8;
  }

  const spkiDer = Buffer.from(der.subarray(spki.hdr, spki.end));
  return {
    algorithmOid,
    parameterOid,
    rsaBits,
    spkiDer,
    spkiSha256: createHash("sha256").update(spkiDer).digest("hex"),
  };
}

/**
 * Independent SPKI fingerprint via OpenSSL. Used as a cross-check in tests and
 * by the live self-test endpoint, never as the primary path, so that a bug in the
 * hand-rolled reader above cannot silently agree with itself.
 */
export function spkiSha256ViaOpenSsl(der: Buffer): string {
  const pem =
    "-----BEGIN CERTIFICATE-----\n" +
    der.toString("base64").replace(/(.{64})/g, "$1\n") +
    "\n-----END CERTIFICATE-----\n";
  const key = createPublicKey(pem);
  const spki = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("hex");
}

/** Public-key fingerprints registered for the algorithms Shorwatch reasons about. */
export const OID = {
  rsaEncryption: "1.2.840.113549.1.1.1",
  ecPublicKey: "1.2.840.10045.2.1",
  x25519: "1.3.101.110",
  x448: "1.3.101.111",
  ed25519: "1.3.101.112",
  ed448: "1.3.101.113",
  // ML-DSA (FIPS 204) — NIST CSOR OIDs.
  mlDsa44: "2.16.840.1.101.3.4.3.18",
  mlDsa65: "2.16.840.1.101.3.4.3.19",
  mlDsa87: "2.16.840.1.101.3.4.3.20",
  // ML-KEM (FIPS 203) — NIST CSOR OIDs.
  mlKem512: "2.16.840.1.101.3.4.2.1",
  mlKem768: "2.16.840.1.101.3.4.2.2",
  mlKem1024: "2.16.840.1.101.3.4.2.3",
  // OpenSSL hybrid key-agreement OIDs.
  x25519MlKem768: "1.3.6.1.4.1.62253.25722",
  secP256r1MlKem768: "1.3.6.1.4.1.62253.25723",
  secP384r1MlKem1024: "1.3.6.1.4.1.62253.25725",
} as const;

const CURVE_LABELS: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.132.0.10": "secp256k1",
  "1.3.101.110": "X25519",
  "1.3.101.111": "X448",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
  "2.16.840.1.101.3.4.3.18": "ML-DSA-44",
  "2.16.840.1.101.3.4.3.19": "ML-DSA-65",
  "2.16.840.1.101.3.4.3.20": "ML-DSA-87",
  "2.16.840.1.101.3.4.2.1": "ML-KEM-512",
  "2.16.840.1.101.3.4.2.2": "ML-KEM-768",
  "2.16.840.1.101.3.4.2.3": "ML-KEM-1024",
  "1.3.6.1.4.1.62253.25722": "X25519MLKEM768",
  "1.3.6.1.4.1.62253.25723": "SecP256r1MLKEM768",
  "1.3.6.1.4.1.62253.25725": "SecP384r1MLKEM1024",
};

export function parameterLabelFor(oid: string | null): string | null {
  if (!oid) return null;
  return CURVE_LABELS[oid] ?? null;
}

export type AlgorithmFamily =
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

export function algorithmFamilyFor(
  algorithmOid: string,
  parameterOid: string | null,
): AlgorithmFamily {
  if (algorithmOid === OID.rsaEncryption) return "rsa";
  if (algorithmOid === OID.ecPublicKey) return "ec";
  if (algorithmOid === OID.ed25519) return "ed25519";
  if (algorithmOid === OID.ed448) return "ed448";
  if (algorithmOid === OID.x25519) return "x25519";
  if (algorithmOid === OID.x448) return "x448";
  if (parameterOid && CURVE_LABELS[parameterOid]?.startsWith("ML-DSA")) return "ml-dsa";
  if (parameterOid && CURVE_LABELS[parameterOid]?.startsWith("ML-KEM")) return "ml-kem";
  if (parameterOid && CURVE_LABELS[parameterOid]?.includes("MLKEM")) return "hybrid";
  return "unknown";
}