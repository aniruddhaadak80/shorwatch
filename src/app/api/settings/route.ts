import { errorResponse } from "@/lib/errors";
import { getOwnerId } from "@/lib/session";
import { readSettings } from "@/lib/service";
import { normaliseIdempotencyKey, normaliseMachine } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const ownerId = await getOwnerId();
    return Response.json(await readSettings(ownerId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ownerId = await getOwnerId();
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const machine = raw.machine ?? {
      logicalQubits: raw.logicalQubits,
      physicalQubits: raw.physicalQubits,
      physicalErrorRate: raw.physicalErrorRate,
    };
    // Validate before writing so a malformed machine model is rejected loudly.
    normaliseMachine(machine);
    normaliseIdempotencyKey(request.headers.get("idempotency-key"));

    const { writeSettings } = await import("@/lib/service");
    const result = await writeSettings(ownerId, {
      retentionYears: raw.retentionYears,
      machine,
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}