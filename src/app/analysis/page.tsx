import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";
import { QubitStaircase } from "@/components/qubit-staircase";
import { getOwnerId } from "@/lib/session";
import { rankAll, readSettings } from "@/lib/service";
import { ANCHORS, SHOR_ANCHOR } from "@/lib/engine/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analysis",
  description:
    "The resource curve behind every deadline: how many physical qubits a quantum adversary needs to factor each key you track, and how that re-orders the queue.",
  alternates: { canonical: "/analysis" },
};

export default async function AnalysisPage() {
  const ownerId = await getOwnerId();
  const [entries, settings] = await Promise.all([rankAll(ownerId), readSettings(ownerId)]);

  const total = entries.length;
  const exposed = entries.filter((entry) => entry.verdict !== "quantum_viable").length;
  const beyondWindow = entries.filter((entry) => entry.daysToCrq > 1_000_000).length;
  const soonest = entries
    .filter((entry) => entry.daysToCrq <= 1_000_000)
    .sort((a, b) => a.daysToCrq - b.daysToCrq)[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="analysis"
        title="How much machine does it take?"
        body="Every deadline in Shorwatch comes from one two-parameter model anchored on a published factoring estimate. Move the assumed machine and the whole queue re-orders, because the ordering is a consequence of the model rather than a stored opinion."
      />

      <dl className="my-8 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="keys tracked" value={String(total)} />
        <Stat label="Shor-exposed" value={String(exposed)} tone={exposed > 0 ? "risk" : "ok"} />
        <Stat label="beyond the window" value={String(beyondWindow)} />
        <Stat
          label="soonest deadline"
          value={
            soonest ? `${soonest.crqDate} · ${soonest.host}` : "no RSA or EC key tracked"
          }
        />
      </dl>

      <QubitStaircase entries={entries} defaults={settings.machine} />

      <section className="panel mt-8">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="legend legend-strong">The model, in full</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Every constant here is also rendered on the standards route.
          </p>
        </div>
        <div className="grid gap-px bg-rule md:grid-cols-2">
          {ANCHORS.map((anchor) => (
            <div key={anchor.id} className="bg-panel p-4">
              <p className="legend legend-strong">{anchor.label}</p>
              <p className="mt-1.5 text-sm leading-relaxed">{anchor.value}</p>
              <a
                href={anchor.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="legend mt-2 inline-block text-signal-live underline underline-offset-2"
              >
                {anchor.source}
              </a>
            </div>
          ))}
        </div>
        <div className="border-t border-rule p-4">
          <p className="legend">Anchor reference</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">
            {SHOR_ANCHOR.logicalQubits.toLocaleString("en-US")} logical qubits and roughly{" "}
            {SHOR_ANCHOR.physicalQubits.toLocaleString("en-US")} physical qubits at an error rate
            of {SHOR_ANCHOR.physicalErrorRate.toExponential(0)} for RSA-{SHOR_ANCHOR.modulusBits},
            in {SHOR_ANCHOR.hours} hours. Logical qubits scale with n&middot;log&#8322;n; physical
            qubits scale with the square of the surface-code distance.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "risk" | "ok";
}) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="legend">{label}</dt>
      <dd
        className={`readout mt-1 text-lg font-semibold ${
          tone === "risk" ? "text-signal-risk" : tone === "ok" ? "text-signal-ok" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}