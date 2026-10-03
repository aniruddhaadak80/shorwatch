"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

interface ProbeOutcome {
  host: string;
  algorithm: string;
  parameterLabel: string | null;
  bits: number | null;
  spkiSha256: string;
  issuer: string;
  notBefore: string;
  ctFirstSeen: string | null;
  score: number;
  verdict: string;
  crqDate: string;
  daysToCrq: number;
  classicalSecurityBits: number;
  recommendation: string;
  seal: string;
  ctIssuances: number;
  dnsAddresses: string[];
  openPorts: number[];
}

type Status = "idle" | "loading" | "done" | "error";

/**
 * The primary action on the landing page: measure a real host from the wire and
 * show the result without persisting anything, so a first visit is useful before
 * anyone creates an account-shaped record.
 */
export function LiveProbe() {
  const router = useRouter();
  const [host, setHost] = useState("vercel.com");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProbeOutcome | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "probe_host", arguments: { host, retentionYears: 10 } },
        }),
      });
      const payload = await response.json();
      const structured = payload?.result?.structuredContent;
      if (!response.ok || payload?.result?.isError || !structured) {
        throw new Error(
          payload?.result?.structuredContent?.error?.message ??
            payload?.error?.message ??
            `probe failed with status ${response.status}`,
        );
      }
      const observation = structured.observation;
      const engine = structured.engine;
      setResult({
        host: observation.host,
        algorithm: observation.key.algorithm,
        parameterLabel: observation.key.parameterLabel,
        bits: observation.key.bits,
        spkiSha256: observation.spkiSha256,
        issuer: observation.issuerCommonName,
        notBefore: observation.notBefore,
        ctFirstSeen: structured.transparency?.firstSeen ?? null,
        ctIssuances: structured.transparency?.issuanceCount ?? 0,
        score: engine.score,
        verdict: engine.verdict,
        crqDate: engine.crqDate,
        daysToCrq: engine.daysToCrq,
        classicalSecurityBits: engine.classicalSecurityBits,
        recommendation: engine.recommendation,
        seal: engine.seal,
        dnsAddresses: structured.dns?.addresses ?? [],
        openPorts: structured.surface?.openPorts ?? [],
      });
      setStatus("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "the probe failed");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={run} className="panel p-4">
      <label htmlFor="probe-host" className="legend">
        Measure a live host
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="probe-host"
          name="host"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          value={host}
          onChange={(event) => setHost(event.target.value)}
          placeholder="example.com"
          aria-describedby="probe-help"
          className="readout flex-1 border border-rule bg-bench px-3 py-2.5 text-sm outline-none focus-visible:border-signal-live"
        />
        <Button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Measuring…" : "Measure now"}
        </Button>
      </div>
      <p id="probe-help" className="legend mt-2">
        A real TLS handshake against port 443. Nothing is stored by this control.
      </p>

      {status === "error" && error ? (
        <p role="alert" className="mt-4 border border-signal-risk p-3 text-sm text-signal-risk">
          {error}
        </p>
      ) : null}

      {status === "done" && result ? (
        <div className="persist mt-4 border border-rule">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-bench-deep px-3 py-2">
            <p className="legend legend-strong">{result.host}</p>
            <p className="legend">
              <span aria-hidden="true" className="mr-1.5 inline-block size-1.5 bg-signal-live" />
              live from the wire
            </p>
          </div>
          <dl className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
            <Cell label="key" value={`${result.parameterLabel ?? result.algorithm}${result.bits ? ` ${result.bits}` : ""}`} />
            <Cell label="classical strength" value={`${result.classicalSecurityBits} bits`} />
            <Cell label="quantum deadline" value={result.crqDate} />
            <Cell
              label="days remaining"
              value={
                Number.isFinite(result.daysToCrq) ? result.daysToCrq.toLocaleString("en-US") : "beyond window"
              }
              tone={result.daysToCrq < 900 ? "risk" : undefined}
            />
            <Cell label="issuer" value={result.issuer} />
            <Cell label="public since" value={result.ctFirstSeen ? result.ctFirstSeen.slice(0, 10) : "not in CT window"} />
            <Cell label="CT records" value={String(result.ctIssuances)} />
            <Cell label="score" value={result.score.toFixed(2)} tone={result.score > 55 ? "risk" : "ok"} />
          </dl>
          <p className="border-t border-rule px-3 py-2 text-sm leading-relaxed text-ink">
            {result.recommendation}
          </p>
          <div className="flex flex-wrap gap-2 border-t border-rule px-3 py-3">
            <Button
              variant="secondary"
              onClick={async () => {
                setStatus("loading");
                const response = await fetch("/api/watches", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ host: result.host, label: "" }),
                });
                if (response.ok) {
                  const payload = await response.json();
                  router.push(`/watches/${payload.watch.id}`);
                } else {
                  setError("could not save that watch");
                  setStatus("error");
                }
              }}
            >
              Watch this host
            </Button>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "risk" | "ok";
}) {
  return (
    <div className="bg-panel px-3 py-2.5">
      <dt className="legend">{label}</dt>
      <dd
        className={`readout mt-0.5 truncate text-sm font-semibold ${
          tone === "risk" ? "text-signal-risk" : tone === "ok" ? "text-signal-ok" : ""
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}