"use client";

import { useState } from "react";
import type { EngineResult } from "@/lib/types";
import { VERDICT_LABEL } from "@/lib/engine";
import { VerdictBadge } from "./ui";

const TONE: Record<string, string> = {
  quantumWeakness: "bg-signal-risk",
  publicExposure: "bg-signal-warn",
  retentionOverlap: "bg-signal-quantum",
  leadTime: "bg-signal-live",
  attackSurface: "bg-ink-faint",
};

/**
 * Each factor is drawn at its real width and its real contribution, so the bar is
 * the arithmetic rather than a decoration of it.
 */
export function FactorLedger({ engine }: { engine: EngineResult }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = engine.factors.find((factor) => factor.key === selected) ?? null;

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Weighted factors contributing to the harvest exposure score of{" "}
          {engine.score.toFixed(2)} out of 100
        </caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="legend py-2 text-left">
              Factor
            </th>
            <th scope="col" className="legend py-2 text-right">
              Weight
            </th>
            <th scope="col" className="legend py-2 text-left">
              Measured
            </th>
            <th scope="col" className="legend py-2 text-right">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {engine.factors.map((factor) => {
            const isActive = selected === factor.key;
            return (
              <tr
                key={factor.key}
                onClick={() => setSelected(isActive ? null : factor.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(isActive ? null : factor.key);
                  }
                }}
                tabIndex={0}
                aria-expanded={isActive}
                className={`cursor-pointer border-b border-rule-soft align-top ${
                  isActive ? "bg-bench-deep" : ""
                }`}
              >
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <span className="legend legend-strong">{factor.label}</span>
                </th>
                <td className="readout py-3 pr-3 text-right text-ink-dim">
                  &times;{factor.weight.toFixed(2)}
                </td>
                <td className="py-3 pr-3">
                  <div
                    className="h-2.5 w-full max-w-[16rem] border border-rule bg-bench-deep"
                    role="img"
                    aria-label={`${factor.label} measured at ${(factor.raw * 100).toFixed(1)} percent`}
                  >
                    <div
                      className={`h-full ${TONE[factor.key] ?? "bg-ink"}`}
                      style={{ width: `${Math.max(factor.raw * 100, factor.raw > 0 ? 1.5 : 0)}%` }}
                    />
                  </div>
                  <p className="readout mt-1 text-xs text-ink-faint">
                    {(factor.raw * 100).toFixed(1)}%
                  </p>
                </td>
                <td className="readout py-3 text-right font-semibold">
                  {factor.contribution.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="legend py-3 text-left">
              Weighted total
            </th>
            <td />
            <td />
            <td className="readout py-3 text-right font-semibold">
              {engine.factors.reduce((sum, f) => sum + f.contribution, 0).toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>

      {active ? (
        <div className="mt-4 border-l-2 border-signal-live bg-bench-deep p-4">
          <p className="legend legend-strong">{active.label}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink">{active.detail}</p>
          <p className="readout mt-2 text-xs text-ink-faint">
            weight {active.weight} &times; measured {active.raw} &times; 100 ={" "}
            {active.contribution} points
          </p>
        </div>
      ) : (
        <p className="legend mt-4">Select a row for the measurement behind it</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={engine.verdict} label={VERDICT_LABEL[engine.verdict]} />
        <p className="legend">engine {engine.engine} v{engine.version}</p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink">{engine.recommendation}</p>
      <p className="readout mt-3 break-all text-[0.7rem] text-ink-faint">
        result seal {engine.seal}
      </p>
    </div>
  );
}