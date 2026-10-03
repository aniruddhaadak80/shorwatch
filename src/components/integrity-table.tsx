"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export interface ChainSummary {
  entityId: string;
  host: string;
  ok: boolean;
  checked: number;
  brokenAt: number | null;
  reason: string | null;
  headSeal: string;
  events: Array<{ seq: number; action: string; at: string; seal: string }>;
}

export function IntegrityTable({ chains }: { chains: ChainSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);

  async function recheck() {
    const response = await fetch("/api/integrity", { cache: "no-store" });
    if (response.ok) window.location.reload();
  }

  if (chains.length === 0) {
    return (
      <p className="panel p-4 text-sm text-ink-dim">
        No chains to replay yet. Create a watch and its first event will appear here.
      </p>
    );
  }

  const allOk = chains.every((chain) => chain.ok);

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="legend" aria-live="polite">
          <span
            aria-hidden="true"
            className={`mr-2 inline-block size-2 ${allOk ? "bg-signal-ok" : "bg-signal-risk"}`}
          />
          {allOk
            ? `${chains.length} chain${chains.length === 1 ? "" : "s"} replay clean`
            : "at least one chain is broken"}
        </p>
        <Button variant="secondary" onClick={recheck}>
          Re-run replay
        </Button>
      </div>

      <ul className="space-y-2">
        {chains.map((chain) => (
          <li key={chain.entityId} className="panel">
            <button
              type="button"
              onClick={() => setOpen(open === chain.entityId ? null : chain.entityId)}
              aria-expanded={open === chain.entityId}
              className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="legend legend-strong">{chain.host}</p>
                <p className="readout mt-1 text-xs text-ink-faint">{chain.entityId}</p>
              </div>
              <div className="text-right">
                <p
                  className={`legend ${chain.ok ? "text-signal-ok" : "text-signal-risk"}`}
                >
                  {chain.ok ? "chain intact" : `broken at event ${chain.brokenAt}`}
                </p>
                <p className="legend mt-0.5">{chain.checked} events verified</p>
              </div>
            </button>

            {chain.reason ? (
              <p role="alert" className="border-t border-rule px-4 py-2 text-sm text-signal-risk">
                {chain.reason}
              </p>
            ) : null}

            {open === chain.entityId ? (
              <div className="border-t border-rule">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-rule">
                      <th scope="col" className="legend px-4 py-2 text-left">Seq</th>
                      <th scope="col" className="legend px-4 py-2 text-left">Action</th>
                      <th scope="col" className="legend px-4 py-2 text-left">At</th>
                      <th scope="col" className="legend px-4 py-2 text-left">Seal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chain.events.map((event) => (
                      <tr key={event.seq} className="border-b border-rule-soft">
                        <td className="readout px-4 py-2">{event.seq}</td>
                        <td className="px-4 py-2">{event.action}</td>
                        <td className="readout px-4 py-2 text-ink-dim">
                          {event.at.slice(0, 19).replace("T", " ")}
                        </td>
                        <td className="readout px-4 py-2 text-ink-faint">
                          {event.seal.slice(0, 20)}…
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="legend px-4 py-3">
                  head {chain.headSeal.slice(0, 32)}…
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}