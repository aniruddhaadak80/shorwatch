import Link from "next/link";
import { SITE } from "@/config/site";
import { ANCHORS, DISCLAIMER, MIGRATION_LEAD_YEARS } from "@/lib/engine/constants";
import { LiveProbe } from "@/components/live-probe";
import { GithubMark } from "@/components/github-mark";
import { REPO_LINK_LABEL } from "@/config/site";

const SOURCES = [
  {
    label: "TLS handshake",
    detail: "node:tls against port 443 — the key comes off the socket, not a form",
    href: "https://nodejs.org/api/tls.html",
  },
  {
    label: "Certificate Transparency",
    detail: "Cert Spotter issuances, matched by SPKI fingerprint",
    href: "https://sslmate.com/certspotter/api/",
  },
  {
    label: "DNS-over-HTTPS",
    detail: "Google Public DNS, for CAA and address records",
    href: "https://developers.google.com/speed/public-dns/docs/doh/json",
  },
  {
    label: "InternetDB",
    detail: "Shodan address exposure for the same host",
    href: "https://internetdb.shodan.io/",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Measure the key that is actually served",
    body: "Shorwatch opens a real TLS connection and parses the SubjectPublicKeyInfo out of the DER. RSA modulus size, curve and algorithm OID are read from the bytes.",
  },
  {
    n: "02",
    title: "Corroborate how long it has been public",
    body: "The exact SPKI fingerprint is matched against Certificate Transparency logs, which answers the only question a TLS probe cannot: since when has anyone been able to harvest this key?",
  },
  {
    n: "03",
    title: "Score it, then prove the arithmetic",
    body: "Five weighted factors produce an exposure score and a projected quantum deadline. Every number is published, and the result is sealed with SHA-384.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="graticule border-b border-rule">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="legend">post-quantum exposure desk · measured, not surveyed</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
            Know which public keys an adversary can already harvest.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-dim">
            A cryptographic inventory is a questionnaire, and questionnaires lie.{" "}
            {SITE.name} reads the certificate a server is{" "}
            <em className="not-italic text-ink">actually serving</em>, checks how long
            that exact key has been sitting in public Certificate Transparency logs, and
            computes the date a quantum adversary breaks it — with every factor shown.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/watches"
              className="legend inline-flex items-center gap-2 border border-bezel bg-bezel px-5 py-3 text-bench transition-colors hover:bg-ink"
            >
              Open the workspace
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link
              href="/analysis"
              className="legend inline-flex items-center gap-2 border border-rule bg-panel px-5 py-3 transition-colors hover:border-ink"
            >
              Qubit staircase
            </Link>
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${REPO_LINK_LABEL} — opens ${SITE.repoUrl} in a new tab`}
              title={`${REPO_LINK_LABEL} — ${SITE.repoUrl}`}
              data-testid="repo-link-landing"
              className="legend inline-flex items-center gap-2 border border-bezel bg-bezel px-5 py-3 text-bench transition-colors hover:bg-ink"
            >
              <GithubMark size={14} />
              {REPO_LINK_LABEL}
            </a>
          </div>

          <div className="mt-10 max-w-3xl">
            <LiveProbe />
          </div>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
          <p className="legend">How a finding is produced</p>
          <ol className="mt-6 grid gap-px bg-rule md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="bg-panel p-5">
                <p className="legend" aria-hidden="true">
                  {step.n}
                </p>
                <h2 className="mt-2 font-display text-lg font-semibold">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-rule">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="legend">Three jobs, done properly</p>
            <ul className="mt-5 space-y-4">
              <li className="border-l-2 border-signal-live pl-4">
                <h3 className="font-display text-base font-semibold">
                  Measure instead of surveying
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">
                  Point at a host and get the key that is really in use, with its
                  fingerprint and DER on record.
                </p>
              </li>
              <li className="border-l-2 border-signal-warn pl-4">
                <h3 className="font-display text-base font-semibold">
                  Triage against a retention horizon
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">
                  Set how long your data must stay secret and every deadline re-derives
                  from the engine, so the first rotation is the one that actually matters.
                </p>
              </li>
              <li className="border-l-2 border-signal-quantum pl-4">
                <h3 className="font-display text-base font-semibold">
                  Leave with a migration artefact
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">
                  Export an OpenSSL 3.5 hybrid configuration, a runbook with the deadline
                  arithmetic, and a sealed JSON dossier.
                </p>
              </li>
            </ul>
          </div>

          <div>
            <p className="legend">Live sources, no API key required</p>
            <ul className="mt-5 divide-y divide-rule border-y border-rule">
              {SOURCES.map((source) => (
                <li key={source.label} className="flex flex-wrap items-baseline gap-x-3 py-3">
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="legend legend-strong underline underline-offset-2"
                  >
                    {source.label}
                  </a>
                  <p className="flex-1 text-xs leading-relaxed text-ink-dim">
                    {source.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bezel">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
          <p className="legend" style={{ color: "var(--color-rule)" }}>
            Published anchors
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            Every constant is on the record
          </h2>
          <div className="mt-6 grid gap-px bg-white/10 md:grid-cols-2">
            {ANCHORS.map((anchor) => (
              <div key={anchor.id} className="p-4">
                <p className="legend" style={{ color: "var(--color-rule)" }}>
                  {anchor.label}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">{anchor.value}</p>
                <a
                  href={anchor.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs underline underline-offset-2"
                  style={{ color: "var(--color-rule)" }}
                >
                  {anchor.source}
                </a>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--color-rule)" }}>
            Migration lead time is a published assumption ({MIGRATION_LEAD_YEARS} years), not a
            measurement. {DISCLAIMER}
          </p>
        </div>
      </section>
    </>
  );
}