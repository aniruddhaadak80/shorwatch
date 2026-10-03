/**
 * Input validation. Every external value is bounded before it reaches the
 * database, the engine or an outbound request.
 */

import { DECISIONS, type Decision, type MachineModel } from "./types";

export class ValidationError extends Error {
  readonly field: string;
  readonly code: string;
  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.code = code;
  }
}

const HOST_PATTERN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/;

/**
 * Normalise a hostname. Accepts a bare host or a full URL and rejects anything
 * that is not a plausible DNS name, so the value can never be used to reach an
 * arbitrary endpoint.
 */
export function normaliseHost(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ValidationError("host", "invalid_type", "host must be a string");
  }
  let value = raw.trim().toLowerCase();
  if (value.length === 0) {
    throw new ValidationError("host", "required", "host is required");
  }
  if (value.length > 253) {
    throw new ValidationError("host", "too_long", "host must be 253 characters or fewer");
  }
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname.toLowerCase();
    } catch {
      throw new ValidationError("host", "invalid", "host is not a parseable URL");
    }
  }
  value = value.replace(/\/.*$/, "").replace(/\.$/, "");
  if (value.includes("@") || value.includes(":") || value.includes("/")) {
    throw new ValidationError("host", "invalid", "host must not contain a port, path or credentials");
  }
  if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".internal")) {
    throw new ValidationError("host", "not_public", "host must be a public DNS name");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    throw new ValidationError("host", "not_public", "enter a DNS name rather than a bare IP address");
  }
  if (!HOST_PATTERN.test(value)) {
    throw new ValidationError("host", "invalid", "host is not a valid DNS name");
  }
  if (!value.includes(".")) {
    throw new ValidationError("host", "invalid", "host must include a top-level domain");
  }
  return value;
}

export function normaliseLabel(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") {
    throw new ValidationError("label", "invalid_type", "label must be a string");
  }
  const value = raw.trim();
  if (value.length > 80) {
    throw new ValidationError("label", "too_long", "label must be 80 characters or fewer");
  }
  return value;
}

export function normaliseNotes(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") {
    throw new ValidationError("notes", "invalid_type", "notes must be a string");
  }
  const value = raw.trim();
  if (value.length > 2000) {
    throw new ValidationError("notes", "too_long", "notes must be 2000 characters or fewer");
  }
  // Strip control characters so notes stay safe to render in any context.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export function normaliseRetentionYears(raw: unknown): number {
  if (raw === undefined || raw === null) return 10;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new ValidationError("retentionYears", "invalid_type", "retentionYears must be a number");
  }
  if (value < 0 || value > 100) {
    throw new ValidationError("retentionYears", "out_of_range", "retentionYears must be between 0 and 100");
  }
  return Math.round(value * 100) / 100;
}

export function normaliseDecision(raw: unknown): Decision {
  if (raw === undefined || raw === null || raw === "") return "undecided";
  if (typeof raw !== "string" || !DECISIONS.includes(raw as Decision)) {
    throw new ValidationError("decision", "invalid_enum", `decision must be one of ${DECISIONS.join(", ")}`);
  }
  return raw as Decision;
}

export function normaliseMachine(raw: unknown): MachineModel {
  const source = (raw ?? {}) as Partial<MachineModel>;
  const logicalQubits = clampNumber(source.logicalQubits, 1, 1_000_000, 4000, "machine.logicalQubits");
  const physicalQubits = clampNumber(source.physicalQubits, 1, 1e12, 20_000_000, "machine.physicalQubits");
  const physicalErrorRate = clampNumber(source.physicalErrorRate, 1e-6, 1e-1, 1e-3, "machine.physicalErrorRate");
  return { logicalQubits, physicalQubits, physicalErrorRate };
}

function clampNumber(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
  field: string,
): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new ValidationError(field, "invalid_type", `${field} must be a number`);
  }
  if (value < min || value > max) {
    throw new ValidationError(field, "out_of_range", `${field} must be between ${min} and ${max}`);
  }
  return value;
}

export function normalisePagination(limit: unknown, offset: unknown): { limit: number; offset: number } {
  const limitValue = limit === undefined || limit === null || limit === "" ? 25 : Number(limit);
  const offsetValue = offset === undefined || offset === null || offset === "" ? 0 : Number(offset);
  if (!Number.isFinite(limitValue) || limitValue < 1 || limitValue > 100) {
    throw new ValidationError("limit", "out_of_range", "limit must be between 1 and 100");
  }
  if (!Number.isFinite(offsetValue) || offsetValue < 0 || offsetValue > 10_000) {
    throw new ValidationError("offset", "out_of_range", "offset must be between 0 and 10000");
  }
  return { limit: Math.floor(limitValue), offset: Math.floor(offsetValue) };
}

/** Sort keys allowed on list endpoints. */
export const SORT_KEYS = ["createdAt", "updatedAt", "host", "score"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export function normaliseSort(raw: unknown): SortKey {
  if (raw === undefined || raw === null || raw === "") return "createdAt";
  if (typeof raw !== "string" || !SORT_KEYS.includes(raw as SortKey)) {
    throw new ValidationError("sort", "invalid_enum", `sort must be one of ${SORT_KEYS.join(", ")}`);
  }
  return raw as SortKey;
}

export function normaliseDirection(raw: unknown): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

/** Idempotency keys bound to a reasonable length. */
export function normaliseIdempotencyKey(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 200) {
    throw new ValidationError("idempotencyKey", "invalid", "idempotencyKey must be a string of 200 characters or fewer");
  }
  return raw;
}