import { describe, expect, it } from "vitest";
import { connect } from "node:tls";
import {
  algorithmFamilyFor,
  decodeOid,
  OID,
  parameterLabelFor,
  parseCertificateSpki,
  readTlv,
  spkiSha256ViaOpenSsl,
} from "./der";

/**
 * Four real certificates captured from the wire, so the parser is checked against
 * bytes OpenSSL itself accepts rather than a hand-built sample.
 */
const FIXTURES = [
  {
    host: "github.com",
    notBefore: "2026-09-01",
    expectedFamily: "ec",
    expectedParameter: "1.2.840.10045.3.1.7",
    expectedLabel: "P-256",
    expectedRsaBits: null,
  },
  {
    host: "vercel.com",
    notBefore: "2026-09-25",
    expectedFamily: "rsa",
    expectedParameter: null,
    expectedLabel: null,
    expectedRsaBits: 2048,
  },
  {
    host: "crt.sh",
    notBefore: "2026-07-23",
    expectedFamily: "rsa",
    expectedParameter: null,
    expectedLabel: null,
    expectedRsaBits: 4096,
  },
  {
    host: "cloudflare.com",
    notBefore: "2026-09-05",
    expectedFamily: "ec",
    expectedParameter: "1.2.840.10045.3.1.7",
    expectedLabel: "P-256",
    expectedRsaBits: null,
  },
] as const;

async function loadFixtures() {
  const mod = await import("./__fixtures__/certs.json");
  return mod.default as Array<{ host: string; notBefore: string; b64: string }>;
}

describe("DER primitives", () => {
  it("decodes multi-byte OID arcs", () => {
    // 1.2.840.113549.1.1.1 = rsaEncryption
    expect(decodeOid(Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]))).toBe(
      "1.2.840.113549.1.1.1",
    );
    // 1.2.840.10045.3.1.7 = prime256v1
    expect(decodeOid(Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]))).toBe(
      "1.2.840.10045.3.1.7",
    );
  });

  it("rejects an empty OID", () => {
    expect(() => decodeOid(Buffer.from([]))).toThrow(/empty OID/);
  });

  it("reads short and long form lengths", () => {
    const short = Buffer.from([0x04, 0x03, 1, 2, 3]);
    expect(readTlv(short, 0)).toMatchObject({ len: 3, start: 2, end: 5, next: 5 });

    const long = Buffer.from([0x04, 0x82, 0x01, 0x00, ...new Array(256).fill(7)]);
    expect(readTlv(long, 0)).toMatchObject({ len: 256, start: 4, end: 260 });
  });

  it("throws past the end of the buffer", () => {
    expect(() => readTlv(Buffer.from([0x04]), 1)).toThrow(/past end/);
  });

  it("throws on a non-certificate", () => {
    expect(() => parseCertificateSpki(Buffer.from([0x02, 0x01, 0x05]))).toThrow(
      /not a SEQUENCE/,
    );
  });
});

describe("SubjectPublicKeyInfo extraction against real certificates", () => {
  it("matches OpenSSL's SPKI fingerprint for every fixture", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.length).toBe(FIXTURES.length);

    for (const [index, fixture] of fixtures.entries()) {
      const der = Buffer.from(fixture.b64, "base64");
      const mine = parseCertificateSpki(der);
      const openssl = spkiSha256ViaOpenSsl(der);

      // The invariant that matters: the slice includes the SEQUENCE's own TLV
      // header. Slicing only the contents yields a fingerprint matching nothing.
      expect(mine.spkiSha256).toBe(openssl);
      expect(mine.spkiSha256).toMatch(/^[0-9a-f]{64}$/);

      const expected = FIXTURES[index];
      expect(fixture.host).toBe(expected.host);
      expect(algorithmFamilyFor(mine.algorithmOid, mine.parameterOid)).toBe(
        expected.expectedFamily,
      );
      expect(mine.parameterOid).toBe(expected.expectedParameter);
      expect(parameterLabelFor(mine.parameterOid)).toBe(expected.expectedLabel);
      expect(mine.rsaBits).toBe(expected.expectedRsaBits);
    }
  });

  it("reports a modulus bit length matching the certificate's own key size", async () => {
    const fixtures = await loadFixtures();
    for (const fixture of fixtures) {
      const der = Buffer.from(fixture.b64, "base64");
      const parsed = parseCertificateSpki(der);
      if (algorithmFamilyFor(parsed.algorithmOid, parsed.parameterOid) !== "rsa") continue;
      const key = await import("node:crypto").then(({ createPublicKey }) =>
        createPublicKey(
          "-----BEGIN CERTIFICATE-----\n" +
            der.toString("base64").replace(/(.{64})/g, "$1\n") +
            "\n-----END CERTIFICATE-----\n",
        ),
      );
      expect(parsed.rsaBits).toBe(key.asymmetricKeyDetails?.modulusLength);
    }
  });
});

describe("algorithm classification", () => {
  it("classifies each registered family", () => {
    expect(algorithmFamilyFor(OID.rsaEncryption, null)).toBe("rsa");
    expect(algorithmFamilyFor(OID.ecPublicKey, "1.2.840.10045.3.1.7")).toBe("ec");
    expect(algorithmFamilyFor(OID.ed25519, null)).toBe("ed25519");
    expect(algorithmFamilyFor(OID.x25519, null)).toBe("x25519");
    expect(algorithmFamilyFor("1.2.3.4", "2.16.840.1.101.3.4.3.19")).toBe("ml-dsa");
    expect(algorithmFamilyFor("1.2.3.4", "2.16.840.1.101.3.4.2.2")).toBe("ml-kem");
    expect(algorithmFamilyFor("1.2.3.4", "1.3.6.1.4.1.62253.25722")).toBe("hybrid");
    expect(algorithmFamilyFor("1.2.3.4", null)).toBe("unknown");
  });

  it("labels post-quantum parameter sets", () => {
    expect(parameterLabelFor("2.16.840.1.101.3.4.3.18")).toBe("ML-DSA-44");
    expect(parameterLabelFor("2.16.840.1.101.3.4.2.3")).toBe("ML-KEM-1024");
    expect(parameterLabelFor("1.3.6.1.4.1.62253.25722")).toBe("X25519MLKEM768");
    expect(parameterLabelFor(null)).toBeNull();
  });
});

/**
 * A live self-test: the production app exposes the same cross-check, so a parser
 * regression shows up as a failing health signal rather than a wrong score.
 */
describe("live SPKI agreement", () => {
  it("agrees with OpenSSL for a certificate fetched right now", async () => {
    const host = process.env.SHORWATCH_LIVE_TEST_HOST;
    if (!host) return; // opt-in: the deterministic fixture test covers the default path

    const raw = await new Promise<Buffer>((resolve, reject) => {
      const socket = connect({
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
        timeout: 10_000,
      });
      socket.once("secureConnect", () => {
        const cert = socket.getPeerCertificate(false);
        socket.destroy();
        resolve(cert.raw as Buffer);
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("timeout"));
      });
      socket.once("error", reject);
    });

    expect(parseCertificateSpki(raw).spkiSha256).toBe(spkiSha256ViaOpenSsl(raw));
  });
});