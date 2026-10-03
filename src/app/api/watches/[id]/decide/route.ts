import { errorResponse, toApiError } from "@/lib/errors";
import { getOwnerId, requireOwnerId } from "@/lib/session";
import { decideWatch, listObservations } from "@/lib/service";
import { readAudit } from "@/lib/service";
import { getDb } from "@/lib/db/client";
import { replayChain } from "@/lib/integrity/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    const ownerId = await requireOwnerId();
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await decideWatch(ownerId, id, raw.decision);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

/** Replay this watch's chain and report the first broken link. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    const ownerId = await getOwnerId();
    const db = await getDb();
    // Serialised rather than concurrent: the embedded local store is a single
    // connection, so interleaved statements are not worth the risk here.
    const events = await readAudit(db, id);
    const observations = await listObservations(ownerId, id).catch(() => []);
    const replay = replayChain(events);
    return Response.json(
      {
        entityId: id,
        ...replay,
        events: events.map((event) => ({
          seq: event.seq,
          action: event.action,
          at: event.at,
          prevSeal: event.prevSeal,
          seal: event.seal,
        })),
        latestEngineSeal: observations[0]?.engine.seal ?? null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}