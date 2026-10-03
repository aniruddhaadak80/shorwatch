import { errorResponse, toApiError } from "@/lib/errors";
import { getOwnerId } from "@/lib/session";
import { getWatch, listObservations } from "@/lib/service";
import { buildBundle } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Produces a real, downloadable migration bundle as a multi-part-free text
 * payload. `?format=json` returns the dossier alone for programmatic use.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const ownerId = await getOwnerId();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return errorResponse(toApiError(new Error("id is required")));
    }

    const watch = await getWatch(ownerId, id);
    const observations = await listObservations(ownerId, id);
    const provenance = [
      observations[0]?.source,
      observations[0]?.transparency?.source,
      observations[0]?.dns?.source,
      observations[0]?.surface?.source,
    ].filter(Boolean) as Array<{
      sourceId: string;
      label: string;
      url: string;
      status: string;
      fetchedAt: string;
    }>;

    const bundle = buildBundle(watch, observations, provenance);
    const format = url.searchParams.get("format") ?? "text";

    if (format === "json") {
      return new Response(JSON.stringify(bundle.dossier, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="shorwatch-${watch.host}.json"`,
          "cache-control": "no-store",
        },
      });
    }

    if (format === "openssl") {
      return new Response(bundle.openssl, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="shorwatch-${watch.host}-openssl.cnf"`,
          "cache-control": "no-store",
        },
      });
    }

    const document = [
      `${"# Shorwatch migration bundle - ${watch.host}"}`,
      bundle.runbook,
      "=".repeat(72),
      "OPENSSL 3.5 CONFIGURATION",
      "=".repeat(72),
      bundle.openssl,
    ].join("\n\n");

    return new Response(document, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="shorwatch-${watch.host}-runbook.txt"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}