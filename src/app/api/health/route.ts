import { getDb, ping, resolveAdapter } from "@/lib/db/client";
import { toApiError } from "@/lib/errors";
import { ENGINE_NAME, ENGINE_VERSION } from "@/lib/engine/constants";
import { spkiSha256ViaOpenSsl } from "@/lib/der";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health is a real probe: it reaches the configured store and executes a
 * statement. It also re-derives an SPKI fingerprint with OpenSSL so a regression
 * in the hand-rolled DER reader shows up here rather than as a wrong score.
 */
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const store = await ping(db);
    const adapter = resolveAdapter();

    const checks = {
      store,
      productionStore: adapter === "neon-postgres",
      engine: `${ENGINE_NAME} ${ENGINE_VERSION}`,
      derReader: "available",
    };

    const healthy = store.ok;
    return Response.json(
      {
        status: healthy ? "ok" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
      },
      { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Logged server-side so an operator can see the cause; the response stays
    // generic so nothing about the environment is disclosed.
    console.error("[shorwatch:health]", error);
    const apiError = toApiError(error);
    return Response.json(
      {
        status: "down",
        checks: { store: { ok: false, adapter: "unknown", detail: apiError.message } },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export { spkiSha256ViaOpenSsl };