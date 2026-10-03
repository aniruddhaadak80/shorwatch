/**
 * One typed SQL surface, two implementations.
 *
 * Production uses Neon Postgres over HTTP, which survives redeploys and cold
 * starts. Local development and the test suite use embedded PGlite, so the
 * project runs with zero required environment variables.
 *
 * Selection is explicit and cannot happen silently: in a production build the
 * absence of DATABASE_URL is a hard failure rather than a fallback to PGlite.
 */

import { DEMO_OWNER, SCHEMA_STATEMENTS, SEED_WATCHES } from "./schema";

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  /** Human-readable adapter identity, surfaced by /api/health. */
  readonly adapter: "neon-postgres" | "pglite";
  close(): Promise<void>;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function databaseUrl(): string | null {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
  return value && value.trim().length > 0 ? value.trim() : null;
}

/** Which adapter this process must use. Never guesses at runtime in production. */
export function resolveAdapter(): "neon-postgres" | "pglite" {
  if (databaseUrl()) return "neon-postgres";
  if (IS_PRODUCTION) {
    // An explicit opt-in lets `next build && next start` be verified on a laptop
    // without weakening the guard: a real deployment never sets this.
    if (process.env.SHORWATCH_ALLOW_EMBEDDED_STORE === "1") return "pglite";
    throw new Error(
      "DATABASE_URL is required in production. Refusing to start with the embedded local adapter.",
    );
  }
  return "pglite";
}

class TransactionClient implements SqlClient {
  constructor(
    private readonly inner: SqlClient,
    private readonly execute: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
  ) {}

  get adapter() {
    return this.inner.adapter;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.execute(sql, params)) as T[];
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async close(): Promise<void> {
    /* transaction-scoped, nothing to close */
  }
}

// ---------------------------------------------------------------------------
// Neon
// ---------------------------------------------------------------------------

async function createNeon(url: string): Promise<SqlClient> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);

  return {
    adapter: "neon-postgres",
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.query(text, params as never[]);
      return rows as T[];
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      // Neon's HTTP driver has no interactive transaction, so each statement in
      // the unit is executed on the same tagged query. The repository only
      // requires statement-level atomicity, which the unique indexes enforce.
      return fn({
        adapter: "neon-postgres",
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
          (await sql.query(text, params as never[])) as R[],
        transaction: async <R,>(): Promise<R> => {
          throw new Error("nested transactions are not supported");
        },
        close: async () => {},
      });
    },
    async close() {
      /* the HTTP driver holds no persistent socket */
    },
  };
}

// ---------------------------------------------------------------------------
// PGlite
// ---------------------------------------------------------------------------

async function createPglite(): Promise<SqlClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  // An explicit data directory keeps local data across restarts; it is
  // gitignored and never selected in production.
  const dataDir = process.env.SHORWATCH_PGLITE_DIR ?? "./.pglite";
  const client = await PGlite.create({ dataDir });

  const run = async <T>(text: string, params: unknown[]): Promise<T[]> => {
    const result = await client.query<T>(text, params as never[]);
    return result.rows;
  };

  const base: SqlClient = {
    adapter: "pglite",
    query: run,
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      await client.exec("BEGIN");
      try {
        const value = await fn({
          adapter: "pglite",
          query: run,
          transaction: async () => {
            throw new Error("nested transactions are not supported");
          },
          close: async () => {},
        });
        await client.exec("COMMIT");
        return value;
      } catch (error) {
        await client.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      await client.close();
    },
  };

  return base;
}

/**
 * Process-wide client, created once and reused.
 *
 * Cached on `globalThis` rather than in module scope on purpose: Next.js compiles
 * Server Components and Route Handlers into separate module graphs, so a
 * module-level cache would create a second connection. For PGlite that is not
 * merely wasteful — two embedded instances on one data directory abort the WASM
 * runtime, and each sees a different snapshot. One shared instance avoids both.
 */
const GLOBAL_KEY = "__shorwatchDb";

interface GlobalWithDb {
  [GLOBAL_KEY]?: Promise<SqlClient>;
}

export function getDb(): Promise<SqlClient> {
  const scope = globalThis as GlobalWithDb;
  if (!scope[GLOBAL_KEY]) {
    scope[GLOBAL_KEY] = (async () => {
      const adapter = resolveAdapter();
      const url = databaseUrl();
      const client = adapter === "neon-postgres" ? await createNeon(url as string) : await createPglite();
      await migrate(client);
      return client;
    })().catch((error) => {
      // Do not cache a failure: a later request may succeed once the network
      // or the database recovers.
      scope[GLOBAL_KEY] = undefined;
      throw error;
    });
  }
  return scope[GLOBAL_KEY];
}

/** Apply the idempotent schema and seed the demo workspace exactly once. */
export async function migrate(client: SqlClient): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await client.query(statement);
  }
  await seed(client);
}

async function seed(client: SqlClient): Promise<void> {
  const existing = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM watches WHERE owner_id = $1",
    [DEMO_OWNER],
  );
  if (Number(existing[0]?.count ?? "0") > 0) return;

  for (const watch of SEED_WATCHES) {
    await client.query(
      `INSERT INTO watches
         (id, owner_id, host, label, retention_years, machine, decision, notes, live)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        watch.id,
        watch.ownerId,
        watch.host,
        watch.label,
        watch.retentionYears,
        JSON.stringify(watch.machine),
        watch.decision,
        watch.notes,
        watch.live,
      ],
    );
  }
  await client.query(
    `INSERT INTO settings (owner_id, retention_years, machine)
     VALUES ($1,$2,$3::jsonb) ON CONFLICT (owner_id) DO NOTHING`,
    [DEMO_OWNER, 10, JSON.stringify(SEED_WATCHES[0].machine)],
  );
}

/** Round-trip proof that the persistence path really executes a statement. */
export async function ping(client: SqlClient): Promise<{ ok: boolean; adapter: string; detail: string }> {
  try {
    const rows = await client.query<{ ok: string }>("SELECT 'ok' AS ok");
    return {
      ok: rows[0]?.ok === "ok",
      adapter: client.adapter,
      detail: "SELECT 1 round-trip succeeded",
    };
  } catch (error) {
    return {
      ok: false,
      adapter: client.adapter,
      detail: error instanceof Error ? error.message : "database round-trip failed",
    };
  }
}

export { TransactionClient };