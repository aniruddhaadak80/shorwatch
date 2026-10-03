import { errorResponse, toApiError } from "@/lib/errors";
import { getOwnerId, requireOwnerId } from "@/lib/session";
import { consume, RATE_LIMITS, sweep } from "@/lib/rate-limit";
import {
  deleteWatch,
  getWatch,
  listObservations,
  updateWatch,
} from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    const ownerId = await getOwnerId();
    const [watch, observations] = await Promise.all([
      getWatch(ownerId, id),
      listObservations(ownerId, id),
    ]);
    return Response.json(
      { watch, observations },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    sweep();
    const { id } = await context.params;
    const ownerId = await requireOwnerId();
    const throttle = consume(`${ownerId}:update`, RATE_LIMITS.update);
    if (!throttle.allowed) {
      return Response.json(
        { error: { code: "rate_limited", message: "too many updates, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const watch = await updateWatch(ownerId, id, {
      label: raw.label,
      retentionYears: raw.retentionYears,
      notes: raw.notes,
      machine: {
        logicalQubits: raw.logicalQubits,
        physicalQubits: raw.physicalQubits,
        physicalErrorRate: raw.physicalErrorRate,
      },
    });
    return Response.json({ watch }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    sweep();
    const { id } = await context.params;
    const ownerId = await requireOwnerId();
    const throttle = consume(`${ownerId}:delete`, RATE_LIMITS.delete);
    if (!throttle.allowed) {
      return Response.json(
        { error: { code: "rate_limited", message: "too many deletes, slow down" } },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const presented = raw.seal ?? request.headers.get("x-shorwatch-seal");
    const result = await deleteWatch(ownerId, id, String(presented ?? ""));
    return Response.json(
      { deleted: true, tombstoneId: result.tombstoneId, seal: result.seal },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}