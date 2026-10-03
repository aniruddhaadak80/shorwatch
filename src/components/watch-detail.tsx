"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorState, MonoValue, SourceChip, VerdictBadge } from "@/components/ui";
import { FactorLedger } from "@/components/factor-ledger";
import { VERDICT_LABEL } from "@/lib/engine";
import { DECISIONS, type KeyObservation, type Watch } from "@/lib/types";

type Props = {
  watch: Watch;
  observations: KeyObservation[];
  owned: boolean;
};

/**
 * Every control here calls a real endpoint: probe re-measures the host, the
 * decision control writes a triage decision, the form PATCHes the watch, and
 * delete requires the current seal and leaves a replayable tombstone.
 */
export function WatchDetail({ watch: initialWatch, observations: initial, owned }: Props) {
  const router = useRouter();
  const [watch, setWatch] = useState(initialWatch);
  const [observations, setObservations] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const [label, setLabel] = useState(watch.label);
  const [retention, setRetention] = useState(String(watch.retentionYears));
  const [notes, setNotes] = useState(watch.notes);

  const selected =
    observations.find((observation) => observation.id === selectedId) ?? observations[0] ?? null;

  async function probe() {
    setBusy("probe");
    setMessage(null);
    try {
      const response = await fetch(`/api/watches/${watch.id}/probe`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "probe failed");
      setWatch(payload.watch);
      setObservations(payload.observations ?? []);
      setSelectedId(payload.observation?.id ?? null);
      setMessage({
        tone: payload.probedLive ? "ok" : "bad",
        text: payload.probedLive
          ? `Re-measured ${watch.host} from the wire.`
          : "The host could not be measured. The previous measurement is still shown.",
      });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "probe failed" });
    } finally {
      setBusy(null);
    }
  }

  async function decide(decision: string) {
    setBusy(`decide:${decision}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/watches/${watch.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "could not record that decision");
      setWatch(payload.watch);
      setMessage({ tone: "ok", text: `Decision recorded as ${decision.replace("_", " ")}.` });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "failed" });
    } finally {
      setBusy(null);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch(`/api/watches/${watch.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label,
          retentionYears: Number(retention),
          notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "could not save");
      setWatch(payload.watch);
      setMessage({ tone: "ok", text: "Saved. Re-measure to apply the new retention horizon." });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "failed" });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete the watch on ${watch.host}? A tombstone is kept so the seal chain stays replayable.`,
    );
    if (!confirmed) return;

    setBusy("delete");
    setMessage(null);
    try {
      const response = await fetch(`/api/watches/${watch.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seal: selected.engine.seal }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "could not delete");
      router.push("/watches");
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : "failed" });
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p
          role="status"
          className={`border p-3 text-sm ${
            message.tone === "ok"
              ? "border-signal-ok text-signal-ok"
              : "border-signal-risk text-signal-risk"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="legend">
              <span
                aria-hidden="true"
                className={`mr-1.5 inline-block size-1.5 ${watch.live ? "bg-signal-live" : "bg-ink-faint"}`}
              />
              {watch.live ? "measured from the live wire" : "no live measurement yet"}
              {watch.lastProbedAt
                ? ` · last ${watch.lastProbedAt.slice(0, 16).replace("T", " ")} UTC`
                : ""}
            </p>
            <h1 className="readout mt-1 break-all font-display text-2xl font-semibold">
              {watch.host}
            </h1>
            {watch.label ? <p className="mt-1 text-sm text-ink-dim">{watch.label}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={probe} disabled={!owned || busy === "probe"}>
              {busy === "probe" ? "Measuring…" : "Re-measure now"}
            </Button>
            <Link
              href={`/export?id=${watch.id}`}
              className="legend inline-flex items-center border border-rule bg-panel px-4 py-2.5 transition-colors hover:border-ink"
            >
              Export bundle
            </Link>
          </div>
        </div>
        {!owned ? (
          <p className="mt-4 border border-rule bg-bench-deep p-3 text-xs leading-relaxed text-ink-dim">
            This is the shared demo watch. You can read it, but only its owner can change or
            delete it. Add your own host to get an editable record.
          </p>
        ) : null}
      </div>

      {observations.length === 0 ? (
        <ErrorState
          title="Nothing measured yet"
          message="This watch has no key observation. Use Re-measure now to read the certificate the host is serving right now."
          onRetry={probe}
        />
      ) : (
        <>
          {observations.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {observations.map((observation) => (
                <button
                  key={observation.id}
                  type="button"
                  onClick={() => setSelectedId(observation.id)}
                  aria-pressed={observation.id === selected?.id}
                  className={`legend border px-3 py-2 ${
                    observation.id === selected?.id
                      ? "border-ink bg-bezel text-bench"
                      : "border-rule bg-panel"
                  }`}
                >
                  {observation.key.parameterLabel ?? observation.key.algorithm}
                  <span className="ml-2 opacity-70">{observation.engine.score.toFixed(1)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {selected ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MonoValue
                  label="exposure score"
                  value={selected.engine.score.toFixed(2)}
                  tone={selected.engine.score > 55 ? "risk" : "ok"}
                />
                <MonoValue
                  label="quantum deadline"
                  value={selected.engine.crqDate}
                  tone={selected.engine.daysToCrq < 900 ? "risk" : "live"}
                />
                <MonoValue
                  label="days remaining"
                  value={
                    Number.isFinite(selected.engine.daysToCrq)
                      ? selected.engine.daysToCrq.toLocaleString("en-US")
                      : "beyond window"
                  }
                />
                <MonoValue
                  label="classical strength"
                  value={`${selected.engine.classicalSecurityBits} bits`}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <VerdictBadge
                  verdict={selected.engine.verdict}
                  label={VERDICT_LABEL[selected.engine.verdict]}
                />
                <SourceChip
                  label={selected.source.label}
                  status={selected.source.status}
                  fetchedAt={selected.source.fetchedAt}
                />
                {selected.transparency ? (
                  <SourceChip
                    label={selected.transparency.source.label}
                    status={selected.transparency.source.status}
                  />
                ) : null}
              </div>

              <section className="panel">
                <div className="border-b border-rule px-4 py-3">
                  <h2 className="legend legend-strong">Measured certificate</h2>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Values read from the DER on the wire, not from a form.
                  </p>
                </div>
                <dl className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="subject CN" value={selected.subjectCommonName} />
                  <Field label="issuer" value={selected.issuerCommonName} />
                  <Field
                    label="algorithm"
                    value={`${selected.key.parameterLabel ?? selected.key.algorithm}${
                      selected.key.bits ? ` · ${selected.key.bits} bit` : ""
                    }`}
                  />
                  <Field label="algorithm OID" value={selected.key.algorithmOid} mono />
                  <Field label="parameter OID" value={selected.key.parameterOid ?? "none"} mono />
                  <Field label="negotiated" value={`${selected.protocol ?? "—"} · ${selected.cipher ?? "—"}`} />
                  <Field label="valid from" value={selected.notBefore.slice(0, 10)} />
                  <Field label="valid to" value={selected.notAfter.slice(0, 10)} />
                  <Field label="serial" value={selected.serialNumber} mono />
                  <Field
                    label="public in CT since"
                    value={
                      selected.transparency
                        ? `${selected.transparency.firstSeen.slice(0, 10)} (${selected.transparency.issuanceCount} records)`
                        : "not in the returned CT window"
                    }
                  />
                  <Field label="addresses" value={selected.dns?.addresses.join(", ") || "none returned"} />
                  <Field label="CAA" value={selected.dns?.caaAuthorisation.join(" · ") || "none returned"} />
                </dl>
                <div className="space-y-2 border-t border-rule p-4">
                  <p className="legend">SubjectPublicKeyInfo SHA-256</p>
                  <p className="readout break-all text-xs">{selected.spkiSha256}</p>
                  <p className="legend mt-3">certificate SHA-256</p>
                  <p className="readout break-all text-xs">{selected.certificateSha256}</p>
                </div>
              </section>

              <section className="panel">
                <div className="border-b border-rule px-4 py-3">
                  <h2 className="legend legend-strong">How the score was reached</h2>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {selected.engine.engine} v{selected.engine.version}
                  </p>
                </div>
                <div className="p-4">
                  <FactorLedger engine={selected.engine} />
                </div>
              </section>

              <section className="panel">
                <div className="border-b border-rule px-4 py-3">
                  <h2 className="legend legend-strong">Quantum resource estimate</h2>
                  <p className="mt-0.5 text-xs text-ink-faint">{selected.engine.quantum.anchor}</p>
                </div>
                <dl className="grid gap-px bg-rule sm:grid-cols-3">
                  <Field
                    label="logical qubits needed"
                    value={selected.engine.quantum.logicalQubitsNeeded.toLocaleString("en-US")}
                    mono
                  />
                  <Field
                    label="physical qubits needed"
                    value={selected.engine.quantum.physicalQubitsNeeded.toLocaleString("en-US")}
                    mono
                  />
                  <Field
                    label="fraction of assumed machine"
                    value={`${(selected.engine.quantum.budgetFraction * 100).toFixed(2)}%`}
                    mono
                  />
                </dl>
                <div className="border-t border-rule p-4">
                  <p className="legend">Quantum advisor (exact statevector, no shot noise)</p>
                  <p className="readout mt-1 text-xs leading-relaxed text-ink-dim">
                    &lt;Z0&gt; = {selected.engine.advisor.expectationZ} · &lt;Z0Z1&gt; ={" "}
                    {selected.engine.advisor.expectationZZ} · adjustment{" "}
                    {selected.engine.advisor.adjustment} points
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-dim">
                    {selected.engine.advisor.description}
                  </p>
                </div>
              </section>

              {owned ? (
                <section className="panel">
                  <div className="border-b border-rule px-4 py-3">
                    <h2 className="legend legend-strong">Triage decision</h2>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      Written to the audit chain, and the same endpoint the agent tool calls.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 p-4">
                    {DECISIONS.map((decision) => (
                      <Button
                        key={decision}
                        variant={watch.decision === decision ? "primary" : "secondary"}
                        disabled={busy === `decide:${decision}`}
                        onClick={() => decide(decision)}
                      >
                        {decision.replace("_", " ")}
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {owned ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={save} className="panel p-4">
            <h2 className="legend legend-strong">Edit the watch</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="label" className="legend">
                  Label
                </label>
                <input
                  id="label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={80}
                  className="w-full border border-rule bg-bench px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="retention" className="legend">
                  Confidentiality requirement (years)
                </label>
                <input
                  id="retention"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={retention}
                  onChange={(event) => setRetention(event.target.value)}
                  className="readout w-full border border-rule bg-bench px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="notes" className="legend">
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="w-full border border-rule bg-bench px-3 py-2 text-sm"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy === "save"} className="mt-4">
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <section className="panel p-4">
            <h2 className="legend legend-strong">Delete</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Deleting soft-deletes the record and keeps a tombstone plus its full audit chain,
              so the seal remains replayable. The request must present the current engine seal,
              which is shown above.
            </p>
            <Button variant="danger" onClick={remove} disabled={!selected || busy === "delete"} className="mt-4">
              {busy === "delete" ? "Deleting…" : "Delete this watch"}
            </Button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-panel px-4 py-2.5">
      <dt className="legend">{label}</dt>
      <dd className={`mt-0.5 text-sm break-all ${mono ? "readout text-xs" : ""}`}>{value}</dd>
    </div>
  );
}