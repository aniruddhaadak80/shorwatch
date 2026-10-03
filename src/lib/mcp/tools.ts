/**
 * MCP-style JSON-RPC 2.0 tool surface.
 *
 * Every handler calls the same service function the corresponding UI control
 * calls, so an agent mutation and a button press travel identical code. Mutating
 * tools accept an idempotency key so a retried call does not duplicate work.
 */

import {
  createWatch,
  decideWatch,
  deleteWatch,
  getWatch,
  listObservations,
  listWatches,
  rankAll,
  readAudit,
  readSettings,
  updateWatch,
  writeSettings,
} from "../service";
import { buildBundle } from "../export";
import { replayChain } from "../integrity/seal";
import { buildEngineInput, gatherLive } from "../sources";
import { evaluateHarvest } from "../engine";
import { ApiError } from "../errors";
import { normaliseIdempotencyKey, normaliseSort, normaliseDirection } from "../validation";
import { ENGINE_NAME, ENGINE_VERSION } from "../engine/constants";
import { SITE } from "../../config/site";
import type { SqlClient } from "../db/client";

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export const SERVER_INFO = {
  name: "shorwatch",
  version: "1.0.0",
  engine: `${ENGINE_NAME} ${ENGINE_VERSION}`,
};

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
}

const HOST_PROPERTY = {
  type: "string",
  description: "Public DNS name to measure, for example example.com",
  maxLength: 253,
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "probe_host",
    title: "Measure a host's live public key",
    description:
      "Perform a real TLS handshake, parse the SubjectPublicKeyInfo from the wire, corroborate it against Certificate Transparency, and return the engine result without persisting anything.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        host: HOST_PROPERTY,
        retentionYears: { type: "number", minimum: 0, maximum: 100, default: 10 },
        logicalQubits: { type: "number", minimum: 1, maximum: 1000000, default: 4000 },
        physicalQubits: { type: "number", minimum: 1, default: 20000000 },
        physicalErrorRate: { type: "number", minimum: 1e-9, maximum: 0.1, default: 0.001 },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "list_watches",
    title: "List watches",
    description: "Return the caller's watches with their latest engine summary.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
        sort: { type: "string", enum: ["createdAt", "updatedAt", "host", "score"], default: "createdAt" },
        direction: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_watch",
    title: "Read one watch and its key observations",
    description: "Return a watch with every stored key observation and its itemised factor breakdown.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "rank_watches",
    title: "Rank every watch by harvest urgency",
    description:
      "Return all watches ordered by how soon their projected quantum deadline arrives, with the quantum resource figures for each key.",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "verify_integrity",
    title: "Replay an entity's seal chain",
    description:
      "Recompute the per-entity SHA-384 chain and report the first broken link, if any.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Watch id, or `all` to verify every entity" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "export_migration_bundle",
    title: "Export a migration bundle",
    description:
      "Return an OpenSSL 3.5 configuration, a migration runbook and a JSON dossier for one watch.",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_watch",
    title: "Create a watch and measure it",
    description:
      "Create a watch for a host, immediately perform a live measurement, and persist the key observation. Idempotent when an idempotencyKey is supplied.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        host: HOST_PROPERTY,
        label: { type: "string", maxLength: 80 },
        retentionYears: { type: "number", minimum: 0, maximum: 100, default: 10 },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
      required: ["host"],
      additionalProperties: false,
    },
  },
  {
    name: "update_watch",
    title: "Update a watch",
    description: "Change the label, retention requirement or machine model of a watch.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string", maxLength: 80 },
        retentionYears: { type: "number", minimum: 0, maximum: 100 },
        notes: { type: "string", maxLength: 2000 },
        logicalQubits: { type: "number", minimum: 1, maximum: 1000000 },
        physicalQubits: { type: "number", minimum: 1 },
        physicalErrorRate: { type: "number", minimum: 1e-9, maximum: 0.1 },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "record_decision",
    title: "Record a triage decision",
    description:
      "Set the triage decision on a watch. This is the same write the decision control performs in the interface.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        decision: {
          type: "string",
          enum: ["undecided", "rotate_now", "hybrid_migrate", "accept_monitor"],
        },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
      required: ["id", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_watch",
    title: "Delete a watch",
    description:
      "Soft-delete a watch and retain a tombstone so the audit chain stays replayable. Requires the record's current seal.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        seal: { type: "string", description: "Current engine seal of the watch's latest observation" },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
      required: ["id", "seal"],
      additionalProperties: false,
    },
  },
  {
    name: "set_machine_model",
    title: "Set the assumed adversary machine",
    description:
      "Store the session's default assumed quantum machine, used by new watches and the analysis route.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        logicalQubits: { type: "number", minimum: 1, maximum: 1000000 },
        physicalQubits: { type: "number", minimum: 1 },
        physicalErrorRate: { type: "number", minimum: 1e-9, maximum: 0.1 },
        retentionYears: { type: "number", minimum: 0, maximum: 100 },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
      additionalProperties: false,
    },
  },
];

export function toolsList(): { tools: Array<{ name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: { readOnlyHint: boolean } }> } {
  return {
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: tool.readOnly },
    })),
  };
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError("bad_request", `${key} is required`, key);
  }
  return value;
}

function machineFrom(args: Record<string, unknown>) {
  const candidate = {
    logicalQubits: args.logicalQubits,
    physicalQubits: args.physicalQubits,
    physicalErrorRate: args.physicalErrorRate,
  };
  if (
    candidate.logicalQubits === undefined &&
    candidate.physicalQubits === undefined &&
    candidate.physicalErrorRate === undefined
  ) {
    return undefined;
  }
  return candidate;
}

export interface ToolContext {
  ownerId: string;
  db: SqlClient;
  /** Shared idempotency store, injected so this module stays testable. */
  idempotency: {
    read(ownerId: string, endpoint: string, key: string): Promise<unknown | null>;
    write(ownerId: string, endpoint: string, key: string, value: unknown): Promise<void>;
  };
}

export async function callTool(
  context: ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<unknown> {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  const definition = TOOLS.find((tool) => tool.name === name);
  if (!definition) {
    throw new ApiError("not_found", `unknown tool ${name}`);
  }

  const idempotencyKey = normaliseIdempotencyKey(args.idempotencyKey);

  // A mutating call with an idempotency key replays the stored result.
  if (!definition.readOnly && idempotencyKey) {
    const cached = await context.idempotency.read(context.ownerId, `mcp:${name}`, idempotencyKey);
    if (cached !== null) return cached;
  }

  const result = await dispatch(context, name, args);
  if (!definition.readOnly && idempotencyKey) {
    await context.idempotency.write(context.ownerId, `mcp:${name}`, idempotencyKey, result);
  }
  return result;
}

async function dispatch(
  context: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "probe_host": {
      const host = requireString(args, "host");
      const settings = await readSettings(context.ownerId);
      const retentionYears =
        typeof args.retentionYears === "number" ? args.retentionYears : settings.retentionYears;
      const machine = { ...settings.machine, ...(machineFrom(args) ?? {}) } as typeof settings.machine;
      const gathered = await gatherLive(host);
      return {
        observation: gathered.observation,
        transparency: gathered.transparency,
        dns: gathered.dns,
        surface: gathered.surface,
        engine: evaluateHarvest(buildEngineInput(gathered, retentionYears, machine)),
      };
    }

    case "list_watches": {
      const limit = typeof args.limit === "number" ? args.limit : 25;
      const offset = typeof args.offset === "number" ? args.offset : 0;
      return listWatches(context.ownerId, {
        limit,
        offset,
        sort: normaliseSort(args.sort),
        direction: normaliseDirection(args.direction),
      });
    }

    case "get_watch": {
      const id = requireString(args, "id");
      const watch = await getWatch(context.ownerId, id);
      const observations = await listObservations(context.ownerId, id);
      return { watch, observations };
    }

    case "rank_watches":
      return { entries: await rankAll(context.ownerId) };

    case "verify_integrity": {
      const id = requireString(args, "id");
      if (id === "all") {
        const entries = await rankAll(context.ownerId);
        const results = [];
        for (const entry of entries) {
          const events = await readAudit(context.db, entry.watchId);
          results.push({ entityId: entry.watchId, ...replayChain(events) });
        }
        return { ok: results.every((r) => r.ok), entities: results };
      }
      const events = await readAudit(context.db, id);
      return { entityId: id, ...replayChain(events) };
    }

    case "export_migration_bundle": {
      const id = requireString(args, "id");
      const watch = await getWatch(context.ownerId, id);
      const observations = await listObservations(context.ownerId, id);
      const provenance = [
        observations[0]?.source,
        observations[0]?.transparency?.source,
        observations[0]?.dns?.source,
        observations[0]?.surface?.source,
      ].filter(Boolean) as Array<{ sourceId: string; label: string; url: string; status: string; fetchedAt: string }>;
      return buildBundle(watch, observations, provenance);
    }

    case "create_watch": {
      const outcome = await createWatch(context.ownerId, {
        host: requireString(args, "host"),
        label: args.label,
        retentionYears: args.retentionYears,
        machine: machineFrom(args),
      });
      return {
        watch: outcome.watch,
        observation: outcome.observation,
        probedLive: outcome.probedLive,
      };
    }

    case "update_watch":
      return {
        watch: await updateWatch(context.ownerId, requireString(args, "id"), {
          label: args.label,
          retentionYears: args.retentionYears,
          notes: args.notes,
          machine: machineFrom(args),
        }),
      };

    case "record_decision": {
      const outcome = await decideWatch(
        context.ownerId,
        requireString(args, "id"),
        args.decision,
      );
      return { watch: outcome.watch, seal: outcome.seal };
    }

    case "delete_watch": {
      const id = requireString(args, "id");
      const seal = requireString(args, "seal");
      // deleteWatch verifies the seal against the record's current head, which is
      // what proves the caller could already read it.
      const outcome = await deleteWatch(context.ownerId, id, seal);
      return { deleted: true, tombstoneId: outcome.tombstoneId, seal: outcome.seal };
    }

    case "set_machine_model":
      return {
        settings: await writeSettings(context.ownerId, {
          retentionYears: args.retentionYears,
          machine: machineFrom(args),
        }),
      };

    default:
      throw new ApiError("not_found", `unknown tool ${name}`);
  }
}

export function errorResponse(id: string | number | null, error: ApiError): JsonRpcResponse {
  // Map transport errors onto JSON-RPC codes, keeping the stable envelope as data.
  const code =
    error.code === "not_found"
      ? METHOD_NOT_FOUND
      : error.code === "bad_request" || error.code === "validation_failed"
        ? INVALID_PARAMS
        : INTERNAL_ERROR;
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message: error.message, data: error.toEnvelope() },
  };
}

export async function handleRequest(
  context: ToolContext,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: INVALID_REQUEST, message: "expected a JSON-RPC 2.0 request object" },
    };
  }

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SITE.mcpProtocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: `${SITE.name} measures live public keys and projects post-quantum harvest deadlines. Start with probe_host, then create_watch to persist a finding.`,
        },
      };

    case "notifications/initialized":
      // A notification carries no id and expects no response.
      return null;

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: toolsList() };

    case "tools/call": {
      const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string") {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: INVALID_PARAMS, message: "params.name is required" },
        };
      }
      try {
        const value = await callTool(context, params.name, params.arguments);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
            structuredContent: value,
            isError: false,
          },
        };
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError("internal", "tool execution failed");
        // A tool failure is a protocol-level result with isError, not a transport error.
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(apiError.toEnvelope(), null, 2) }],
            structuredContent: apiError.toEnvelope(),
            isError: true,
          },
        };
      }
    }

    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };

    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: METHOD_NOT_FOUND, message: `unknown method ${request.method}` },
      };
  }
}

export { PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR };