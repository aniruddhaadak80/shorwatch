"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { VERDICT_LABEL, type Verdict } from "@/lib/engine";
import {
  SHOR_ANCHOR,
  MIGRATION_LEAD_YEARS,
  CRQ_ANCHOR_YEAR,
  YEARS_PER_DOUBLING,
} from "@/lib/engine/constants";

export interface StairEntry {
  watchId: string;
  host: string;
  label: string;
  decision: string;
  live: boolean;
  observationId: string;
  algorithmLabel: string;
  bits: number | null;
  score: number;
  verdict: string;
  daysToCrq: number;
  crqDate: string;
  retentionYears: number;
  physicalQubitsNeeded: number;
  logicalQubitsNeeded: number;
  budgetFraction: number;
}

const MODULI = [1024, 2048, 3072, 4096];

/** Kept outside the component so the clock is not read during render work. */
function todayMs(): number {
  return Date.now();
}

/** Compact axis label, e.g. 20000000 becomes "20M". */
function compact(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
  return value.toFixed(0);
}

/**
 * The signature interaction.
 *
 * Horizontal axis: RSA modulus bits. Vertical axis: physical qubits, log scale.
 * The drawn staircase is the published anchor and its interpolation, so the curve
 * is a real model rather than an illustration. Moving the capacity line re-runs
 * the engine's own deadline projection for every stored key at once, and the
 * queue below re-orders to match — the chart is a control, not a picture.
 */
export function QubitStaircase({
  entries,
  defaults,
}: {
  entries: StairEntry[];
  defaults: { physicalQubits: number; physicalErrorRate: number; logicalQubits: number };
}) {
  const [capacity, setCapacity] = useState(defaults.physicalQubits);
  const [errorRate, setErrorRate] = useState(defaults.physicalErrorRate);
  const [retention, setRetention] = useState(10);

  const distance = useMemo(() => {
    const raw = Math.round((Math.log2(1 / errorRate) * SHOR_ANCHOR.codeDistance) / Math.log2(1 / SHOR_ANCHOR.physicalErrorRate));
    return Math.max(3, raw);
  }, [errorRate]);

  /** Same function the server uses, recomputed client-side for instant feedback. */
  const curve = useMemo(() => {
    return MODULI.map((bits) => {
      const logical = Math.round(
        SHOR_ANCHOR.logicalQubits *
          (bits / SHOR_ANCHOR.modulusBits) *
          (Math.log2(bits) / Math.log2(SHOR_ANCHOR.modulusBits)),
      );
      const physical = Math.round(logical * (distance / SHOR_ANCHOR.codeDistance) ** 2 * (SHOR_ANCHOR.physicalQubits / SHOR_ANCHOR.logicalQubits));
      const crqYear = Math.min(
        2060,
        Math.max(2028, Math.round(CRQ_ANCHOR_YEAR + YEARS_PER_DOUBLING * (Math.log2(bits) - 11))),
      );
      return { bits, physical, crqYear };
    });
  }, [distance]);

  /**
   * Plot bounds. The y axis is logarithmic, so positions must be normalised
   * against the log *range* of the plotted values. Dividing log10(v) by
   * log10(max) instead would collapse every point into the top of the box,
   * because all the values share a decade.
   */
  const bounds = useMemo(() => {
    const values = [...curve.map((point) => point.physical), capacity];
    const logs = values.map((value) => Math.log10(Math.max(value, 1)));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    const span = hi - lo || 1;
    return {
      lo,
      hi,
      yFor: (value: number) => 90 - ((Math.log10(Math.max(value, 1)) - lo) / span) * 74,
    };
  }, [curve, capacity]);

  /** Re-rank: the same ordering rule the analysis route uses. */
  const ranked = useMemo(() => {
    return entries
      .map((entry) => {
        const crqYear = estimateCrqYear(entry);
        const crqDate = new Date(Date.UTC(crqYear, 0, 1));
        const daysToCrq = Math.round((crqDate.getTime() - todayMs()) / 86_400_000);
        const leadTime = daysToCrq - Math.round(MIGRATION_LEAD_YEARS * 365.25);
        const affordable = entry.physicalQubitsNeeded <= capacity;
        return { ...entry, crqYear, daysToCrq, leadTime, affordable };
      })
      .sort((a, b) => {
        // Unaffordable breaks come first: the machine model has already arrived
        // for those, so they are the ones with no lead time left.
        if (a.affordable !== b.affordable) return a.affordable ? 1 : -1;
        return a.daysToCrq - b.daysToCrq || b.score - a.score;
      });
  }, [entries, capacity]);

  const breached = ranked.filter((entry) => !entry.affordable).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <div>
            <h2 className="legend legend-strong">The qubit staircase</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              {SHOR_ANCHOR.citation} · code distance d = {distance}
            </p>
          </div>
          <p className="legend" aria-live="polite">
            {breached === 0
              ? "no key is within the assumed machine"
              : `${breached} key${breached === 1 ? "" : "s"} within the assumed machine`}
          </p>
        </div>

<div className="graticule relative p-4">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-72 w-full"
            role="img"
            aria-label={`Physical qubits required to factor an RSA modulus, from ${curve[0].physical.toLocaleString("en-US")} qubits at 1024 bits to ${curve[curve.length - 1].physical.toLocaleString("en-US")} at 4096 bits. The assumed capacity line sits at ${capacity.toLocaleString("en-US")} qubits.`}
          >
            {/* Decade rules, so a log axis can be read rather than trusted. */}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = 90 - fraction * 74;
              const value = 10 ** (bounds.lo + fraction * (bounds.hi - bounds.lo));
              return (
                <g key={fraction}>
                  <line
                    x1={4}
                    x2={96}
                    y1={y}
                    y2={y}
                    stroke="var(--color-rule)"
                    strokeWidth={0.3}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text x={4.5} y={y - 1} fontSize={2.4} fill="var(--color-ink-faint)">
                    {compact(value)}
                  </text>
                </g>
              );
            })}

            {/* Staircase: each modulus size is a real computed requirement. */}
            <polyline
              points={curve
                .map((point, index) => {
                  const x = 8 + index * (84 / (curve.length - 1));
                  return `${x},${bounds.yFor(point.physical)}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--color-signal-risk)"
              strokeWidth={0.9}
              vectorEffect="non-scaling-stroke"
            />
            {curve.map((point, index) => {
              const x = 8 + index * (84 / (curve.length - 1));
              const y = bounds.yFor(point.physical);
              return (
                <g key={point.bits}>
                  <circle cx={x} cy={y} r={1.1} fill="var(--color-signal-risk)" />
                  <text
                    x={x}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={3}
                    fill="var(--color-ink-dim)"
                  >
                    {point.bits}
                  </text>
                  <text x={x} y={98} textAnchor="middle" fontSize={2.6} fill="var(--color-ink-faint)">
                    {point.crqYear}
                  </text>
                </g>
              );
            })}

            {/* The capacity line is the control. */}
<line
              x1={4}
              x2={96}
              y1={bounds.yFor(capacity)}
              y2={bounds.yFor(capacity)}
              stroke="var(--color-signal-live)"
              strokeWidth={1.1}
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <p className="legend mt-2">
            x: RSA modulus bits · y: physical qubits (log scale, labelled) · lower labels:
            projected CRQ year · dashed line: assumed machine
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="capacity" className="legend">
                Assumed physical qubits · {capacity.toLocaleString("en-US")}
              </label>
              <input
                id="capacity"
                type="range"
                min={Math.log10(1e5)}
                max={Math.log10(1e10)}
                step={0.02}
                value={Math.log10(capacity)}
                onChange={(event) => setCapacity(Math.round(10 ** Number(event.target.value)))}
                className="mt-2 w-full accent-[var(--color-signal-live)]"
              />
            </div>
            <div>
              <label htmlFor="error-rate" className="legend">
                Assumed physical error rate · {errorRate.toExponential(0)}
              </label>
              <input
                id="error-rate"
                type="range"
                min={-6}
                max={-2}
                step={0.05}
                value={Math.log10(errorRate)}
                onChange={(event) => setErrorRate(Number((10 ** Number(event.target.value)).toPrecision(1)))}
                className="mt-2 w-full accent-[var(--color-signal-live)]"
              />
            </div>
            <div>
              <label htmlFor="retention" className="legend">
                Confidentiality requirement · {retention} years
              </label>
              <input
                id="retention"
                type="range"
                min={0}
                max={60}
                step={1}
                value={retention}
                onChange={(event) => setRetention(Number(event.target.value))}
                className="mt-2 w-full accent-[var(--color-signal-live)]"
              />
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                const response = await fetch("/api/settings", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    machine: {
                      logicalQubits: defaults.logicalQubits,
                      physicalQubits: capacity,
                      physicalErrorRate: errorRate,
                    },
                    retentionYears: retention,
                  }),
                });
                if (!response.ok) {
                  const payload = await response.json().catch(() => null);
                  throw new Error(payload?.error?.message ?? "could not save the machine model");
                }
              }}
            >
              Save this machine model
            </Button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="legend legend-strong">Queue, re-ranked live</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Same ordering rule as the API, recomputed as you drag.
          </p>
        </div>
        {ranked.length === 0 ? (
          <p className="p-4 text-sm text-ink-dim">
            No measured keys yet. Add a watch on the{" "}
            <Link href="/watches" className="underline underline-offset-2">
              workspace
            </Link>{" "}
            and measure it first.
          </p>
        ) : (
          <ol className="divide-y divide-rule-soft">
            {ranked.map((entry, index) => (
              <li key={entry.observationId} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="legend">
                      <span aria-hidden="true" className="mr-1.5">{String(index + 1).padStart(2, "0")}</span>
                      {entry.affordable ? "beyond the assumed machine" : "within the assumed machine"}
                    </p>
                    <Link
                      href={`/watches/${entry.watchId}`}
                      className="readout mt-0.5 block truncate text-sm font-semibold underline underline-offset-2"
                    >
                      {entry.host}
                    </Link>
                    <p className="legend mt-0.5">
                      {entry.algorithmLabel} · retention {entry.retentionYears}y
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="readout text-base font-semibold">{entry.score.toFixed(1)}</p>
                    <p className="legend">{VERDICT_LABEL[entry.verdict as Verdict] ?? entry.verdict}</p>
                    <p className="readout mt-0.5 text-xs text-ink-dim">
                      {entry.leadTime > 0 ? `${entry.leadTime.toLocaleString("en-US")}d left` : "no lead time"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/**
 * Projected CRQ year for a stored entry under the current machine assumptions.
 * Mirrors `crqYearFor` in src/lib/engine/resources.ts for RSA and EC entries.
 */
function estimateCrqYear(entry: StairEntry): number {
  if (entry.verdict === "quantum_viable") return 2099;
  const bits = entry.bits ?? 256;
  if (entry.algorithmLabel.toLowerCase().includes("rsa")) {
    return clamp(CRQ_ANCHOR_YEAR + YEARS_PER_DOUBLING * (Math.log2(bits) - 11));
  }
  // Elliptic-curve keys are converted to an equal-strength modulus then discounted.
  const modulus = bits >= 521 ? 4096 : bits >= 384 ? 3072 : 2048;
  const base = clamp(CRQ_ANCHOR_YEAR + YEARS_PER_DOUBLING * (Math.log2(modulus) - 11));
  return clamp(CRQ_ANCHOR_YEAR + (base - CRQ_ANCHOR_YEAR) * 0.75 + (bits > 521 ? 1 : 0));
}

function clamp(value: number): number {
  return Math.min(2060, Math.max(2028, Math.round(value)));
}