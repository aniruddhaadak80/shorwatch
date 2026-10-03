import { Suspense } from "react";
import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";
import { WatchList } from "@/components/watch-list";
import { getOwnerId } from "@/lib/session";
import { listWatches } from "@/lib/service";
import {
  normaliseDirection,
  normalisePagination,
  normaliseSort,
} from "@/lib/validation";
import { toApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watches",
  description:
    "Every host you are tracking, with the key it serves, how long that key has been public, and how soon a quantum adversary breaks it.",
  alternates: { canonical: "/watches" },
};

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WatchesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const ownerId = await getOwnerId();

  let watches = [] as Awaited<ReturnType<typeof listWatches>>["watches"];
  let total = 0;
  let failure: string | null = null;

  try {
    const { limit, offset } = normalisePagination(first(params.limit), first(params.offset));
    const result = await listWatches(ownerId, {
      limit,
      offset,
      sort: normaliseSort(first(params.sort)),
      direction: normaliseDirection(first(params.direction)),
    });
    watches = result.watches;
    total = result.total;
  } catch (error) {
    failure = toApiError(error).message;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="workspace"
        title="Watches"
        body="Each watch holds a host, the key it was last seen serving, and the deadline the engine derives for that key. Add a host and Shorwatch measures it immediately."
      >
        <Suspense fallback={null}>
          <WatchList initial={watches} total={total} />
        </Suspense>
      </PageIntro>
      {failure ? (
        <p role="alert" className="mt-6 border border-signal-risk p-4 text-sm text-signal-risk">
          {failure}
        </p>
      ) : null}
    </div>
  );
}