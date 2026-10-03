import { errorResponse } from "@/lib/errors";
import { getOwnerId } from "@/lib/session";
import { rankAll } from "@/lib/service";
import { readSettings } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The ranked queue that the Qubit Staircase re-orders as the machine changes. */
export async function GET(): Promise<Response> {
  try {
    const ownerId = await getOwnerId();
    const [entries, settings] = await Promise.all([rankAll(ownerId), readSettings(ownerId)]);
    return Response.json(
      {
        entries,
        settings,
        total: entries.length,
        worst: entries.reduce(
          (acc, entry) => (entry.score > (acc?.score ?? -1) ? entry : acc),
          null as (typeof entries)[number] | null,
        ),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}