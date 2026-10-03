/**
 * Start Shorwatch in production mode against the embedded store, for local
 * verification and for the browser journey.
 *
 *   node scripts/start-local.mjs [port] [dataDir]
 *
 * The production guard is on by default: without DATABASE_URL a production build
 * refuses to start. This script sets the explicit opt-in so `next start` can be
 * verified on a machine with no hosted database. A real deployment never sets it.
 *
 * Give each concurrent run its own data directory. PGlite is a single embedded
 * instance, and two servers sharing one directory abort its WASM runtime.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const port = process.argv[2] ?? "3000";
const dataDir = process.argv[3] ?? ".pglite";

const child = spawn(
  process.execPath,
  [resolve(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SHORWATCH_ALLOW_EMBEDDED_STORE: "1",
      SHORWATCH_PGLITE_DIR: dataDir,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);

const stop = () => {
  child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});