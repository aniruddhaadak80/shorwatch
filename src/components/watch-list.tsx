"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, EmptyState, ErrorState, VerdictBadge } from "@/components/ui";
import { VERDICT_LABEL } from "@/lib/engine";
import type { Watch } from "@/lib/types";

const SORTS = [
  { value: "createdAt", label: "Newest" },
  { value: "score", label: "Highest score" },
  { value: "host", label: "Host" },
  { value: "updatedAt", label: "Recently probed" },
] as const;

/**
 * Filters, sort and page live in the URL so a view can be shared or survived by
 * a refresh. Every control here performs a real request.
 */
export function WatchList({ initial, total }: { initial: Watch[]; total: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [host, setHost] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sort = params.get("sort") ?? "score";
  const limit = params.get("limit") ?? "25";
  const offset = Number(params.get("offset") ?? "0");

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "offset") next.delete("offset");
    startTransition(() => {
      router.replace(`/watches?${next.toString()}`, { scroll: false });
    });
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/watches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host, label }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `request failed (${response.status})`);
      }
      setHost("");
      setLabel("");
      // Navigate straight to the new watch. A refresh here would race the
      // navigation and abort the render stream mid-flight.
      router.push(`/watches/${payload.watch.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "could not create that watch");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="panel p-4">
        <p className="legend">Add a host to watch</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
          <div>
            <label htmlFor="new-host" className="sr-only">
              Host name
            </label>
            <input
              id="new-host"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="example.com"
              required
              spellCheck={false}
              className="readout w-full border border-rule bg-bench px-3 py-2.5 text-sm outline-none focus-visible:border-signal-live"
            />
          </div>
          <div>
            <label htmlFor="new-label" className="sr-only">
              Label
            </label>
            <input
              id="new-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="What is this for?"
              maxLength={80}
              className="w-full border border-rule bg-bench px-3 py-2.5 text-sm outline-none focus-visible:border-signal-live"
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Measuring…" : "Add and measure"}
          </Button>
        </div>
        <p className="legend mt-2">
          Saving performs a live handshake, so this control really does contact the host.
        </p>
        {error ? (
          <p role="alert" className="mt-3 border border-signal-risk p-3 text-sm text-signal-risk">
            {error}
          </p>
        ) : null}
      </form>

      <div className="panel flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="sort" className="legend">
              Sort
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(event) => updateParam("sort", event.target.value)}
              className="readout mt-1 block border border-rule bg-bench px-3 py-2 text-sm"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="limit" className="legend">
              Per page
            </label>
            <select
              id="limit"
              value={limit}
              onChange={(event) => updateParam("limit", event.target.value)}
              className="readout mt-1 block border border-rule bg-bench px-3 py-2 text-sm"
            >
              {[10, 25, 50].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="legend" aria-live="polite">
          {pending ? "loading…" : `${total} watch${total === 1 ? "" : "es"}`}
        </p>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          title="No watches yet"
          body="Add a host above. Shorwatch will read the certificate it serves, corroborate it against Certificate Transparency and score the result."
        />
      ) : (
        <ul className="grid gap-px bg-rule">
          {initial.map((watch) => (
            <li key={watch.id} className="bg-panel">
              <Link
                href={`/watches/${watch.id}`}
                className="block p-4 transition-colors hover:bg-bench-deep"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="legend">
                      <span
                        aria-hidden="true"
                        className={`mr-1.5 inline-block size-1.5 ${
                          watch.live ? "bg-signal-live" : "bg-ink-faint"
                        }`}
                      />
                      {watch.live ? "live" : "not yet measured"}
                    </p>
                    <p className="readout mt-1 truncate text-base font-semibold">{watch.host}</p>
                    {watch.label ? (
                      <p className="mt-0.5 truncate text-xs text-ink-dim">{watch.label}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {watch.summary ? (
                      <>
                        <VerdictBadge
                          verdict={watch.summary.worstVerdict}
                          label={VERDICT_LABEL[watch.summary.worstVerdict]}
                        />
                        <span className="readout text-lg font-semibold">
                          {watch.summary.worstScore.toFixed(1)}
                        </span>
                      </>
                    ) : (
                      <span className="legend">no measurement</span>
                    )}
                  </div>
                </div>
                {watch.summary ? (
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-dim">
                    <div className="flex gap-1.5">
                      <dt className="legend">keys</dt>
                      <dd className="readout">{watch.summary.observationCount}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="legend">exposed</dt>
                      <dd className="readout">{watch.summary.exposedKeyCount}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="legend">deadline</dt>
                      <dd className="readout">
                        {watch.summary.daysToCrq == null
                          ? "—"
                          : watch.summary.daysToCrq > 1_000_000
                            ? "beyond window"
                            : `${watch.summary.daysToCrq.toLocaleString("en-US")}d`}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="legend">decision</dt>
                      <dd>{watch.decision.replace("_", " ")}</dd>
                    </div>
                  </dl>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > Number(limit) ? (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => updateParam("offset", String(Math.max(0, offset - Number(limit))))}
          >
            Previous
          </Button>
          <p className="legend">
            {offset + 1}–{Math.min(offset + Number(limit), total)} of {total}
          </p>
          <Button
            variant="secondary"
            disabled={offset + Number(limit) >= total}
            onClick={() => updateParam("offset", String(offset + Number(limit)))}
          >
            Next
          </Button>
        </div>
      ) : null}

      {error && initial.length === 0 ? <ErrorState message={error} /> : null}
    </div>
  );
}