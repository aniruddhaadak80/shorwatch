import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro, EmptyState } from "@/components/ui";
import { getOwnerId } from "@/lib/session";
import { getWatch, listObservations, rankAll } from "@/lib/service";
import { buildBundle } from "@/lib/export";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Export",
  description:
    "Turn a measured watch into a real artefact: an OpenSSL 3.5 hybrid configuration, a migration runbook with the deadline arithmetic, and a sealed JSON dossier.",
  alternates: { canonical: "/export" },
};

type Search = Record<string, string | string[] | undefined>;

export default async function ExportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const requested = Array.isArray(params.id) ? params.id[0] : params.id;
  const ownerId = await getOwnerId();

  let entry: Awaited<ReturnType<typeof rankAll>>[number] | null = null;
  try {
    entry = requested
      ? ((await getWatch(ownerId, requested)), null)
      : (await rankAll(ownerId))[0] ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") notFound();
  }

  const watchId = requested ?? entry?.watchId ?? null;

  let bundle: ReturnType<typeof buildBundle> | null = null;
  if (watchId) {
    try {
      const watch = await getWatch(ownerId, watchId);
      const observations = await listObservations(ownerId, watchId);
      const provenance = [
        observations[0]?.source,
        observations[0]?.transparency?.source,
        observations[0]?.dns?.source,
        observations[0]?.surface?.source,
      ].filter(Boolean) as Array<{
        sourceId: string;
        label: string;
        url: string;
        status: string;
        fetchedAt: string;
      }>;
      bundle = buildBundle(watch, observations, provenance);
    } catch {
      bundle = null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="takeaway"
        title="Leave with something you can act on"
        body="An export is not a screenshot. It is an OpenSSL 3.5 configuration generated from the key you actually measured, a runbook that prints the deadline arithmetic so it can be audited, and a JSON dossier carrying every seal."
      />

      <div className="my-8 grid gap-px bg-rule sm:grid-cols-3">
        <DownloadCard
          title="Migration runbook"
          detail="Plain text with the measurement, every factor, the ordered plan and the anchors."
          href={watchId ? `/api/export?id=${watchId}` : null}
        />
        <DownloadCard
          title="OpenSSL 3.5 configuration"
          detail="Hybrid key-agreement groups and signature algorithms, sized from the observed key."
          href={watchId ? `/api/export?id=${watchId}&format=openssl` : null}
        />
        <DownloadCard
          title="JSON dossier"
          detail="Machine-readable record with provenance, engine results and seals."
          href={watchId ? `/api/export?id=${watchId}&format=json` : null}
        />
      </div>

      {watchId ? (
        <p className="legend mb-6">
          Exporting{" "}
          <Link href={`/watches/${watchId}`} className="text-signal-live underline underline-offset-2">
            {watchId}
          </Link>
          . Change the watch with <code>?id=</code> in the address.
        </p>
      ) : null}

      {bundle ? (
        <div className="space-y-6">
          <section className="panel">
            <div className="border-b border-rule px-4 py-3">
              <h2 className="legend legend-strong">OpenSSL 3.5 configuration</h2>
              <p className="mt-0.5 text-xs text-ink-faint">Generated from the measured key</p>
            </div>
            <pre className="readout max-h-96 overflow-auto p-4 text-xs leading-relaxed">
              {bundle.openssl}
            </pre>
          </section>

          <section className="panel">
            <div className="border-b border-rule px-4 py-3">
              <h2 className="legend legend-strong">Migration runbook</h2>
              <p className="mt-0.5 text-xs text-ink-faint">
                The same document the download produces
              </p>
            </div>
            <pre className="readout max-h-96 overflow-auto p-4 text-xs leading-relaxed">
              {bundle.runbook}
            </pre>
          </section>
        </div>
      ) : (
        <EmptyState
          title="Nothing to export yet"
          body="Add a watch and let Shorwatch measure it. The export is generated from what was actually observed, so there is nothing to show until then."
          action={
            <Link
              href="/watches"
              className="legend border border-bezel bg-bezel px-4 py-2.5 text-bench"
            >
              Open the workspace
            </Link>
          }
        />
      )}
    </div>
  );
}

function DownloadCard({
  title,
  detail,
  href,
}: {
  title: string;
  detail: string;
  href: string | null;
}) {
  return (
    <div className="flex flex-col bg-panel p-4">
      <h2 className="legend legend-strong">{title}</h2>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-dim">{detail}</p>
      {href ? (
        <a
          href={href}
          download
          className="legend mt-4 w-fit border border-bezel bg-bezel px-3 py-2 text-bench transition-colors hover:bg-ink"
        >
          Download
        </a>
      ) : (
        <p className="legend mt-4 text-ink-faint">unavailable</p>
      )}
    </div>
  );
}