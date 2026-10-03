import { errorResponse } from "@/lib/errors";
import { getOwnerId } from "@/lib/session";
import { getDb } from "@/lib/db/client";
import { readAudit, rankAll } from "@/lib/service";
import { replayChain } from "@/lib/integrity/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replay every chain the caller can see and report the first broken link in each. */
export async function GET(request: Request): Promise<Response> {
  try {
    const ownerId = await getOwnerId();
    const url = new URL(request.url);
    const only = url.searchParams.get("id");
    const db = await getDb();

    const entries = only ? [] : await rankAll(ownerId);
    const entityIds = only ? [only] : Array.from(new Set(entries.map((e) => e.watchId)));

    const results = [];
    for (const entityId of entityIds) {
      const events = await readAudit(db, entityId);
      const replay = replayChain(events);
      results.push({
        entityId,
        ok: replay.ok,
        checked: replay.checked,
        brokenAt: replay.brokenAt,
        reason: replay.reason,
        headSeal: replay.headSeal,
        events: events.map((event) => ({
          seq: event.seq,
          action: event.action,
          at: event.at,
          prevSeal: event.prevSeal,
          seal: event.seal,
        })),
      });
    }

    return Response.json(
      {
        ok: results.every((result) => result.ok),
        entities: results,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}