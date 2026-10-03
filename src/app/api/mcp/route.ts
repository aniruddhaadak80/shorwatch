import { errorResponse, toApiError } from "@/lib/errors";
import { requireOwnerId } from "@/lib/session";
import { consume, RATE_LIMITS, sweep } from "@/lib/rate-limit";
import { getDb } from "@/lib/db/client";
import {
  callTool,
  errorResponse as rpcError,
  handleRequest,
  PARSE_ERROR,
  type JsonRpcRequest,
  type ToolContext,
} from "@/lib/mcp/tools";
import { readIdempotent, writeIdempotent } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP-style JSON-RPC 2.0 endpoint.
 *
 * Accepts a single request or a batch, answers notifications with no body, and
 * scopes every call to the caller's anonymous session.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    sweep();
    const ownerId = await requireOwnerId();
    const throttle = consume(`${ownerId}:mcp`, RATE_LIMITS.mcp);
    if (!throttle.allowed) {
      return Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: `rate limited, retry in ${throttle.retryAfterSeconds}s`,
          },
        },
        { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } },
      );
    }

    const db = await getDb();
    const context: ToolContext = {
      ownerId,
      db,
      idempotency: {
        read: (o, endpoint, key) => readIdempotent(db, o, endpoint, key),
        write: (o, endpoint, key, value) => writeIdempotent(db, o, endpoint, key, value),
      },
    };

    const body = await request.json().catch(() => null);
    const headers = { "cache-control": "no-store" };

    if (body === null) {
      return Response.json(
        { jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "request body is not valid JSON" } },
        { status: 400, headers },
      );
    }

    if (Array.isArray(body)) {
      if (body.length === 0) {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "empty batch" } },
          { status: 400, headers },
        );
      }
      const responses = [];
      for (const entry of body as JsonRpcRequest[]) {
        const response = await handleRequest(context, entry);
        if (response) responses.push(response);
      }
      return responses.length === 0
        ? new Response(null, { status: 204, headers })
        : Response.json(responses, { headers });
    }

    const response = await handleRequest(context, body as JsonRpcRequest);
    if (!response) return new Response(null, { status: 204, headers });
    return Response.json(response, { headers });
  } catch (error) {
    const apiError = toApiError(error);
    return Response.json(rpcError(null, apiError), {
      status: apiError.status,
      headers: { "cache-control": "no-store" },
    });
  }
}

/** Convenience for humans and curl: the tool catalogue without a JSON-RPC envelope. */
export async function GET(): Promise<Response> {
  try {
    const ownerId = await getOwnerIdForListing();
    void ownerId;
    const { toolsList } = await import("@/lib/mcp/tools");
    return Response.json(toolsList(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

async function getOwnerIdForListing(): Promise<string> {
  const { getOwnerId } = await import("@/lib/session");
  return getOwnerId();
}

export { callTool };