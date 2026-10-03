import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";
import {
  ANCHORS,
  CRQ_ANCHOR_YEAR,
  DISCLAIMER,
  MIGRATION_LEAD_DAYS,
  NIST_EC_ANCHORS,
  NIST_RSA_ANCHORS,
  PQC_PARAMETERS,
  SHOR_ANCHOR,
  WEIGHTS,
  YEARS_PER_DOUBLING,
} from "@/lib/engine/constants";
import { OID } from "@/lib/der";
import { VQC_CIRCUITS, VQC_DESCRIPTION, VQC_WEIGHTS } from "@/lib/engine/vqc";
import { ENGINE_NAME, ENGINE_VERSION } from "@/lib/engine";

export const metadata: Metadata = {
  title: "Standards",
  description:
    "Every constant the Shorwatch engine uses, with its source: NIST security equivalences, FIPS 203 and 204 parameter sizes, the factoring resource anchor, and the quantum advisor weights.",
  alternates: { canonical: "/standards" },
};

const OID_ROWS = [
  { label: "RSA", oid: OID.rsaEncryption, note: "Broken by Shor's algorithm." },
  { label: "Elliptic curve", oid: OID.ecPublicKey, note: "id-ecPublicKey; broken by the quantum discrete log." },
  { label: "Ed25519", oid: OID.ed25519, note: "Shor applies to the underlying curve." },
  { label: "X25519", oid: OID.x25519, note: "Key agreement; Shor applies." },
  { label: "ML-DSA-44", oid: OID.mlDsa44, note: "FIPS 204." },
  { label: "ML-DSA-65", oid: OID.mlDsa65, note: "FIPS 204." },
  { label: "ML-DSA-87", oid: OID.mlDsa87, note: "FIPS 204." },
  { label: "ML-KEM-512", oid: OID.mlKem512, note: "FIPS 203." },
  { label: "ML-KEM-768", oid: OID.mlKem768, note: "FIPS 203." },
  { label: "ML-KEM-1024", oid: OID.mlKem1024, note: "FIPS 203." },
  { label: "X25519MLKEM768", oid: OID.x25519MlKem768, note: "OpenSSL hybrid key agreement." },
  { label: "SecP256r1MLKEM768", oid: OID.secP256r1MlKem768, note: "OpenSSL hybrid key agreement." },
];

export default function StandardsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="standards"
        title="Every constant, with its source"
        body={`${ENGINE_NAME} ${ENGINE_VERSION} makes no claim that is not printed on this page. If a number moves the deadline, it is here, cited, and covered by a unit test.`}
      />

      <div className="mt-8 space-y-8">
        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Scoring weights</h2>
            <p className="mt-0.5 text-xs text-ink-faint">Sum to exactly 1.000</p>
          </div>
          <ul className="divide-y divide-rule-soft">
            {Object.entries(WEIGHTS).map(([key, weight]) => (
              <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                <code className="readout text-sm">{key}</code>
                <span className="readout text-sm font-semibold">{weight.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">NIST comparable classical security</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              SP 800-57 Part 1 Rev. 5. Values between anchors are interpolated in log&#8322; modulus.
            </p>
          </div>
          <div className="grid gap-px bg-rule sm:grid-cols-2">
            <div>
              <p className="legend bg-panel px-4 py-2">RSA modulus → strength</p>
              <ul className="divide-y divide-rule-soft">
                {NIST_RSA_ANCHORS.map((anchor) => (
                  <li key={anchor.bits} className="flex justify-between px-4 py-2 text-sm">
                    <span className="readout">{anchor.bits} bit</span>
                    <span className="readout font-semibold">{anchor.strength} bit</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="legend bg-panel px-4 py-2">Curve → strength</p>
              <ul className="divide-y divide-rule-soft">
                {NIST_EC_ANCHORS.map((anchor) => (
                  <li key={anchor.curve} className="flex justify-between px-4 py-2 text-sm">
                    <span className="readout">
                      {anchor.curve} ({anchor.bits})
                    </span>
                    <span className="readout font-semibold">{anchor.strength} bit</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Post-quantum parameter sets</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Sizes in bytes, from FIPS 203 and FIPS 204.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className="legend px-4 py-2 text-left">Set</th>
                  <th scope="col" className="legend px-4 py-2 text-left">Standard</th>
                  <th scope="col" className="legend px-4 py-2 text-right">Level</th>
                  <th scope="col" className="legend px-4 py-2 text-right">Public key</th>
                  <th scope="col" className="legend px-4 py-2 text-right">Secret key</th>
                  <th scope="col" className="legend px-4 py-2 text-right">Ciphertext</th>
                  <th scope="col" className="legend px-4 py-2 text-right">Signature</th>
                </tr>
              </thead>
              <tbody>
                {PQC_PARAMETERS.map((row) => (
                  <tr key={row.label} className="border-b border-rule-soft">
                    <th scope="row" className="readout px-4 py-2.5 text-left font-medium">{row.label}</th>
                    <td className="px-4 py-2.5 text-ink-dim">{row.standard}</td>
                    <td className="readout px-4 py-2.5 text-right">{row.nistLevel}</td>
                    <td className="readout px-4 py-2.5 text-right">{row.publicKeyBytes}</td>
                    <td className="readout px-4 py-2.5 text-right">{row.secretKeyBytes}</td>
                    <td className="readout px-4 py-2.5 text-right">{row.ciphertextBytes || "—"}</td>
                    <td className="readout px-4 py-2.5 text-right">{row.signatureBytes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Algorithm OIDs Shorwatch recognises</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Read straight from the DER SubjectPublicKeyInfo.
            </p>
          </div>
          <ul className="divide-y divide-rule-soft">
            {OID_ROWS.map((row) => (
              <li key={row.oid} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="w-40 text-sm font-medium">{row.label}</span>
                <code className="readout text-xs text-ink-dim">{row.oid}</code>
                <span className="flex-1 text-xs text-ink-faint">{row.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Factoring resource model</h2>
            <p className="mt-0.5 text-xs text-ink-faint">{SHOR_ANCHOR.citation}</p>
          </div>
          <div className="space-y-3 p-4 text-sm leading-relaxed">
            <p>
              <strong>Anchor.</strong> {SHOR_ANCHOR.logicalQubits.toLocaleString("en-US")}{" "}
              logical qubits and roughly {SHOR_ANCHOR.physicalQubits.toLocaleString("en-US")} physical
              qubits at p = {SHOR_ANCHOR.physicalErrorRate.toExponential(0)} (code distance{" "}
              {SHOR_ANCHOR.codeDistance}) factor RSA-{SHOR_ANCHOR.modulusBits} in{" "}
              {SHOR_ANCHOR.hours} hours.
            </p>
            <p className="readout text-xs">
              L(n) = L(2048) · (n / 2048) · (log₂n / 11)
            </p>
            <p className="readout text-xs">
              d(p) = round(13 · log₂(1/p) / log₂(1000)), minimum 3
            </p>
            <p className="readout text-xs">
              P(n, p) = L(n) · (d / 13)² · (20,000,000 / 4,098)
            </p>
            <p>
              <strong>Deadline.</strong> crqYear(n) = {CRQ_ANCHOR_YEAR} + {YEARS_PER_DOUBLING} ·
              log₂(n / 2048), clamped to 2028–2060. Elliptic-curve keys are converted to an
              equal-strength modulus and discounted by 0.75, because the quantum discrete-log
              attack is cheaper than factoring at the same claimed strength.
            </p>
            <p>
              <strong>Lead time.</strong> {MIGRATION_LEAD_DAYS.toLocaleString("en-US")} days
              (3 years) is reserved for a migration programme before a key is called overdue.
            </p>
            <p className="text-xs text-ink-faint">
              These are order-of-magnitude projections for planning, not forecasts. Quantum
              resource estimates for cryptography remain an active research area.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Quantum advisor</h2>
            <p className="mt-0.5 text-xs text-ink-faint">{VQC_CIRCUITS}</p>
          </div>
          <div className="space-y-3 p-4 text-sm leading-relaxed">
            <p>{VQC_DESCRIPTION}</p>
            <p className="readout text-xs">
              signal = {VQC_WEIGHTS.z}·&lt;Z0&gt; + {VQC_WEIGHTS.zz}·&lt;Z0Z1&gt; +{" "}
              {VQC_WEIGHTS.bias}
            </p>
            <p className="readout text-xs">adjustment = 3.5 · tanh(signal)</p>
            <p className="text-xs text-ink-faint">
              Exact statevector arithmetic means there is no shot noise, so the engine, the REST
              endpoint and the agent tool all return byte-identical results for identical input.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Anchors and sources</h2>
          </div>
          <ul className="divide-y divide-rule-soft">
            {ANCHORS.map((anchor) => (
              <li key={anchor.id} className="px-4 py-3">
                <p className="legend legend-strong">{anchor.label}</p>
                <p className="mt-1 text-sm">{anchor.value}</p>
                <a
                  href={anchor.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="legend mt-1.5 inline-block text-signal-live underline underline-offset-2"
                >
                  {anchor.source}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel border-signal-warn p-4">
          <p className="legend" style={{ color: "var(--color-signal-warn)" }}>
            Disclaimer
          </p>
          <p className="mt-2 text-sm leading-relaxed">{DISCLAIMER}</p>
        </section>
      </div>
    </div>
  );
}