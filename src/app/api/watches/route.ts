import { errorResponse, toApiError } from "@/lib/errors";
import { getOwnerId, requireOwnerId } from "@/lib/session";
import { consume, RATE_LIMITS, sweep } from "@/lib/rate-limit";
import {
  createWatch,
  listWatches,
  readIdempotent,
  writeIdempotent,
  readSettings,
} from "@/lib/service";
import { getDb } from "@/lib/db/client";
import {
  normaliseDirection,
  normaliseHost,
  normaliseIdempotencyKey,
  normaliseLabel,
  normalisePagination,
  normaliseRetentionYears,
  normaliseSort,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const ownerId = await getOwnerId();
    const url = new URL(request.url);
    const { limit, offset } = normalisePagination(
      url.searchParams.get("limit"),
      url.searchParams.get("offset"),
    );
    const sort = normaliseSort(url.searchParams.get("sort"));
    const direction = normaliseDirection(url.searchParams.get("direction"));

    const [result, settings] = await Promise.all([
      listWatches(ownerId, { limit, offset, sort, direction }),
      readSettings(ownerId),
    ]);

    return Response.json(
      { ...result, limit, offset, sort, direction, settings },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    sweep();
    const ownerId = await requireOwnerId();
    const throttle = consume(`${ownerId}:create`, RATE_LIMITS.create);
    if (!throttle.allowed) {
      return Response.json(
        {
          error: {
            code: "rate_limited",
            message: `too many writes, retry in ${throttle.retryAfterSeconds}s`,
          },
        },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const idempotencyKey = normaliseIdempotencyKey(
      request.headers.get("idempotency-key") ?? raw.idempotencyKey,
    );

    const host = normaliseHost(raw.host);
    const label = normaliseLabel(raw.label);
    const retentionYears = normaliseRetentionYears(raw.retentionYears);

    const db = await getDb();
    if (idempotencyKey) {
      const cached = await readIdempotent(db, ownerId, "POST /api/watches", idempotencyKey);
      if (cached !== null) {
        return Response.json({ ...(cached as object), idempotentReplay: true }, { status: 200 });
      }
    }

    const result = await createWatch(ownerId, { host, label, retentionYears });
    const body = { ...result, idempotentReplay: false };

    if (idempotencyKey) {
      await writeIdempotent(db, ownerId, "POST /api/watches", idempotencyKey, result);
    }
    return Response.json(body, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}