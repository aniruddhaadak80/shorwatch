import { errorResponse, toApiError } from "@/lib/errors";
import { getOwnerId, requireOwnerId } from "@/lib/session";
import { consume, RATE_LIMITS, sweep } from "@/lib/rate-limit";
import { getWatch, listObservations, probeWatch } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Re-measure a host on demand. This is the refresh control in the interface and
 * the `probe` action in the audit chain; both paths land here.
 */
export async function POST(_request: Request, context: Context): Promise<Response> {
  try {
    sweep();
    const { id } = await context.params;
    const ownerId = await requireOwnerId();
    const throttle = consume(`${ownerId}:probe`, RATE_LIMITS.probe);
    if (!throttle.allowed) {
      return Response.json(
        {
          error: {
            code: "rate_limited",
            message: `live probing is limited to ${RATE_LIMITS.probe} per minute, retry in ${throttle.retryAfterSeconds}s`,
          },
        },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    await getWatch(ownerId, id);
    const result = await probeWatch(ownerId, id);
    const observations = await listObservations(ownerId, id);

    return Response.json(
      {
        watch: result.watch,
        observation: result.observation,
        observations,
        probedLive: result.probedLive,
      },
      { status: result.probedLive ? 200 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

export { getOwnerId };