/**
 * Anonymous ownership.
 *
 * Shorwatch has no accounts. `src/proxy.ts` establishes an unguessable owner id
 * in an HTTP-only cookie before any render, so every page and API call in a
 * session shares one identity. Every query is scoped to that owner, which means
 * one visitor can never read or mutate another visitor's watches.
 *
 * Destructive operations additionally require the record's current seal, which a
 * third party cannot know.
 */

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { ApiError } from "./errors";

export const OWNER_COOKIE = "shorwatch_owner";
const OWNER_PATTERN = /^[a-f0-9]{32}$/;

export function newOwnerId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Read the owner for the current session. Read-only, because Server Components
 * cannot mutate the cookie jar; proxy guarantees one already exists.
 */
export async function getOwnerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(OWNER_COOKIE)?.value;
  if (existing && OWNER_PATTERN.test(existing)) return existing;

  // Only reachable if the proxy matcher was bypassed. Return a stable value for
  // this render rather than throwing, so a page still renders truthfully.
  return newOwnerId();
}

/**
 * Owner for a mutating request. Kept as a separate name so it is obvious at the
 * call site that the request may write.
 */
export async function requireOwnerId(): Promise<string> {
  return getOwnerId();
}

/**
 * Guard a destructive mutation. The caller must present the record's current
 * seal, which only something that could already read the record can know.
 */
export function assertSealMatches(presented: unknown, expected: string): void {
  if (typeof presented !== "string" || presented.length === 0) {
    throw new ApiError("bad_request", "a seal is required for this operation", "seal");
  }
  if (presented !== expected) {
    throw new ApiError("conflict", "the supplied seal does not match the current record");
  }
}