import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";
import { IntegrityTable } from "@/components/integrity-table";
import { getOwnerId } from "@/lib/session";
import { getDb } from "@/lib/db/client";
import { readAudit, rankAll } from "@/lib/service";
import { replayChain } from "@/lib/integrity/seal";
import { GENESIS_SEAL } from "@/lib/integrity/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify",
  description:
    "Replay every Shorwatch audit chain. Each event is sealed with SHA-384 over the previous seal and canonical JSON, and this route names the first broken link.",
  alternates: { canonical: "/verify" },
};

export default async function VerifyPage() {
  const ownerId = await getOwnerId();
  const db = await getDb();
  const entries = await rankAll(ownerId);
  const entityIds = Array.from(new Set(entries.map((entry) => entry.watchId)));

  const chains = [];
  for (const entityId of entityIds) {
    const events = await readAudit(db, entityId);
    const replay = replayChain(events);
    const host = entries.find((entry) => entry.watchId === entityId)?.host ?? entityId;
    chains.push({
      entityId,
      host,
      ok: replay.ok,
      checked: replay.checked,
      brokenAt: replay.brokenAt,
      reason: replay.reason,
      headSeal: replay.headSeal,
      events: events.map((event) => ({
        seq: event.seq,
        action: event.action,
        at: event.at,
        seal: event.seal,
      })),
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="integrity"
        title="Nothing here can be quietly rewritten"
        body="Every create, probe, update, decision and delete appends an event sealed against the one before it. Replaying a chain recomputes all of them and names the first event that fails, which is why a doctored row cannot hide."
      />

      <div className="my-8 border border-rule bg-panel p-4">
        <p className="legend legend-strong">Chain rule</p>
        <p className="readout mt-2 text-xs leading-relaxed">
          seal<sub>n</sub> = SHA-384( UTF-8(seal<sub>n-1</sub>) || canonicalJson(event<sub>n</sub>) )
        </p>
        <p className="legend mt-2">
          genesis = <code>{GENESIS_SEAL.slice(0, 24)}…</code> · canonical JSON sorts object keys
          recursively and preserves array order
        </p>
      </div>

      <IntegrityTable chains={chains} />
    </div>
  );
}