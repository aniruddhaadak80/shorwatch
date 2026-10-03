import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui";
import { WatchDetail } from "@/components/watch-detail";
import { getOwnerId } from "@/lib/session";
import { getWatch, listObservations } from "@/lib/service";
import { DEMO_OWNER } from "@/lib/db/schema";
import { toApiError, ApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  try {
    const ownerId = await getOwnerId();
    const watch = await getWatch(ownerId, id);
    return {
      title: watch.label || watch.host,
      description: `Measured public key exposure for ${watch.host}: ${
        watch.summary ? `${watch.summary.observationCount} key observation(s), worst score ${watch.summary.worstScore.toFixed(1)}` : "not yet measured"
      }.`,
      alternates: { canonical: `/watches/${watch.id}` },
    };
  } catch {
    return { title: "Watch", alternates: { canonical: `/watches/${id}` } };
  }
}

export default async function WatchPage({ params }: { params: Params }) {
  const { id } = await params;
  const ownerId = await getOwnerId();

  let watch;
  let observations;
  try {
    watch = await getWatch(ownerId, id);
    observations = await listObservations(ownerId, id);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError instanceof ApiError && apiError.code === "not_found") notFound();
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <BackLink href="/watches">All watches</BackLink>
      <div className="mt-6">
        <WatchDetail
          watch={watch}
          observations={observations}
          owned={watch.ownerId === ownerId && watch.ownerId !== DEMO_OWNER}
        />
      </div>
    </div>
  );
}