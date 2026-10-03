import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { getOwnerId } from "@/lib/session";
import { readSettings } from "@/lib/service";
import { MIGRATION_LEAD_DAYS, SHOR_ANCHOR } from "@/lib/engine/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Set the confidentiality horizon and the assumed adversary machine that Shorwatch uses to project deadlines.",
  alternates: { canonical: "/settings" },
};

export default async function SettingsPage() {
  const ownerId = await getOwnerId();
  const settings = await readSettings(ownerId);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="configuration"
        title="Your assumptions, stated"
        body="Shorwatch projects deadlines from two inputs you control: how long your data must stay confidential, and what machine you assume the adversary will eventually field. Both are stored per session and both change every deadline."
      />

      <div className="my-8">
        <SettingsForm initial={settings} />
      </div>

      <section className="panel p-4">
        <p className="legend legend-strong">What these values do</p>
        <dl className="mt-3 space-y-3 text-sm leading-relaxed">
          <div>
            <dt className="legend">Confidentiality horizon</dt>
            <dd className="text-ink-dim">
              If the data behind this host must stay secret for longer than the projected quantum
              deadline, the finding is an active harvest-now-decrypt-later risk and the retention
              factor saturates.
            </dd>
          </div>
          <div>
            <dt className="legend">Physical qubits and error rate</dt>
            <dd className="text-ink-dim">
              These drive the resource curve. The default error rate of{" "}
              {SHOR_ANCHOR.physicalErrorRate.toExponential(0)} reproduces the published anchor of{" "}
              {SHOR_ANCHOR.physicalQubits.toLocaleString("en-US")} physical qubits for RSA-
              {SHOR_ANCHOR.modulusBits}.
            </dd>
          </div>
          <div>
            <dt className="legend">Reserved lead time</dt>
            <dd className="text-ink-dim">
              {MIGRATION_LEAD_DAYS.toLocaleString("en-US")} days is held back for the migration
              programme itself. A key is &ldquo;overdue&rdquo; when that reserve is already spent.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}