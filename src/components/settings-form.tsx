"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { MachineModel } from "@/lib/types";

export function SettingsForm({
  initial,
}: {
  initial: { retentionYears: number; machine: MachineModel };
}) {
  const [retention, setRetention] = useState(String(initial.retentionYears));
  const [logicalQubits, setLogicalQubits] = useState(String(initial.machine.logicalQubits));
  const [physicalQubits, setPhysicalQubits] = useState(String(initial.machine.physicalQubits));
  const [physicalErrorRate, setPhysicalErrorRate] = useState(
    String(initial.machine.physicalErrorRate),
  );
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          retentionYears: Number(retention),
          machine: {
            logicalQubits: Number(logicalQubits),
            physicalQubits: Number(physicalQubits),
            physicalErrorRate: Number(physicalErrorRate),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "could not save");
      setStatus({
        tone: "ok",
        text: `Saved at ${new Date(payload.updatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC. New watches will use these assumptions.`,
      });
    } catch (caught) {
      setStatus({
        tone: "bad",
        text: caught instanceof Error ? caught.message : "could not save",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel p-4">
      <p className="legend legend-strong">Assumed adversary</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id="retention"
          label="Confidentiality horizon (years)"
          hint="How long data behind these hosts must stay secret."
          value={retention}
          onChange={setRetention}
          min={0}
          max={100}
        />
        <Field
          id="logical"
          label="Logical qubits"
          hint="Used for context; the curve derives its own requirement."
          value={logicalQubits}
          onChange={setLogicalQubits}
          min={1}
          max={1000000}
        />
        <Field
          id="physical"
          label="Physical qubits deployed"
          hint="1e6 = one million. The published RSA-2048 anchor is 2e7."
          value={physicalQubits}
          onChange={setPhysicalQubits}
          min={1}
        />
        <Field
          id="error"
          label="Physical error rate"
          hint="The anchor assumes 0.001."
          value={physicalErrorRate}
          onChange={setPhysicalErrorRate}
          step="any"
        />
      </div>

      <Button type="submit" disabled={busy} className="mt-5">
        {busy ? "Saving…" : "Save assumptions"}
      </Button>

      {status ? (
        <p
          role="status"
          className={`mt-4 border p-3 text-sm ${
            status.tone === "ok"
              ? "border-signal-ok text-signal-ok"
              : "border-signal-risk text-signal-risk"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="legend">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="readout mt-1 w-full border border-rule bg-bench px-3 py-2 text-sm"
      />
      <p className="legend mt-1">{hint}</p>
    </div>
  );
}