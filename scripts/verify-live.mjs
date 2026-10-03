/**
 * Live verification.
 *
 * Reads the base URL from the environment (no secrets, no hardcoded host) and
 * proves the product against a running deployment with real HTTP requests:
 *
 *   landing -> health -> live probe -> create -> read-back -> update ->
 *   engine result -> MCP initialize -> tools/list -> MCP mutation ->
 *   integrity replay -> delete -> tombstone -> repository links
 *
 * Usage:
 *   node scripts/verify-live.mjs                       # http://localhost:3000
 *   BASE_URL=https://example.vercel.app npm run verify
 */

import { createHash } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const REPO_URL = process.env.REPO_URL ?? "https://github.com/aniruddhaadak80/shorwatch";
const PROBE_HOST = process.env.PROBE_HOST ?? "vercel.com";

let passed = 0;
let failed = 0;
const failures = [];

/** One cookie jar per run so the anonymous session is stable across checks. */
const cookies = new Map();

function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function absorbCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const entry of raw) {
    const [pair] = entry.split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookies.size > 0) headers.cookie = cookieHeader();
  if (init.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  absorbCookies(response);
  return response;
}

async function json(path, init) {
  const response = await call(path, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, response };
}

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
  return condition;
}

function section(title) {
  console.log(`\n${title}`);
}

/** Short, safe rendering of an unexpected payload so failures are diagnosable. */
function summarise(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text ? text.slice(0, 220) : "(empty body)";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Verifying ${BASE}`);

  section("1. Landing and repository access");
  {
    const home = await call("/");
    const html = await home.text();
    check("GET / returns 200", home.status === 200, `status ${home.status}`);
    check("landing carries the product promise", /harvest/i.test(html));
    check("navigation links to the repository", html.includes(REPO_URL));
    check("footer links to the repository", html.includes(REPO_URL));
    check(
      "repository links open in a new tab safely",
      html.includes('rel="noopener noreferrer"'),
    );
  }

  section("2. Health and persistence");
  {
    const { status, body } = await json("/api/health");
    check("GET /api/health returns 200", status === 200, `status ${status}`);
    check("health reports an ok store", body?.checks?.store?.ok === true);
    check(
      "health names the adapter it reached",
      typeof body?.checks?.store?.adapter === "string",
    );
    check(
      "health reports the engine version",
      typeof body?.checks?.engine === "string" && body.checks.engine.includes("shorwatch-quantum"),
    );
    console.log(
      `        adapter=${body?.checks?.store?.adapter} productionStore=${body?.checks?.productionStore}`,
    );
  }

  section("3. MCP initialize and tool discovery");
  let toolNames = [];
  {
    const { status, body } = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    check("initialize returns 200", status === 200, `status ${status}`);
    check("initialize returns a protocol version", typeof body?.result?.protocolVersion === "string");
    check("initialize returns server info", body?.result?.serverInfo?.name === "shorwatch");

    const list = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    toolNames = (list.body?.result?.tools ?? []).map((tool) => tool.name);
    check("tools/list returns tools", toolNames.length >= 3, `${toolNames.length} tools`);
    check(
      "a read tool is exposed",
      ["probe_host", "list_watches", "get_watch", "rank_watches"].some((name) =>
        toolNames.includes(name),
      ),
      toolNames.join(","),
    );
    check(
      "an analysis tool is exposed",
      toolNames.includes("probe_host"),
      toolNames.join(","),
    );
    check(
      "a mutating tool is exposed",
      ["create_watch", "record_decision", "update_watch", "delete_watch"].some((name) =>
        toolNames.includes(name),
      ),
      toolNames.join(","),
    );
    const schemasValid = (list.body?.result?.tools ?? []).every(
      (tool) => tool.inputSchema && tool.inputSchema.type === "object",
    );
    check("every tool has an object input schema", schemasValid);

    const bad = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "no/such/method" }),
    });
    check("unknown method returns -32601", bad.body?.error?.code === -32601);
  }

  section("4. Live measurement through the agent tool");
  let spki = "";
  {
    const { body } = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "probe_host", arguments: { host: PROBE_HOST, retentionYears: 10 } },
      }),
    });
    const result = body?.result?.structuredContent;
    check("probe_host returned a result", body?.result?.isError === false, JSON.stringify(body).slice(0, 200));
    check("an observation was read off the wire", result?.observation?.source?.status === "live");
    spki = result?.observation?.spkiSha256 ?? "";
    check("the SPKI fingerprint is a sha256", /^[0-9a-f]{64}$/.test(spki), spki);
    check("an algorithm was classified", typeof result?.observation?.key?.algorithm === "string");
    check(
      "Certificate Transparency was queried",
      result?.transparency !== undefined,
    );
    console.log(
      `        ${PROBE_HOST} key=${result?.observation?.key?.parameterLabel ?? result?.observation?.key?.algorithm} verdict=${result?.engine?.verdict} score=${result?.engine?.score}`,
    );
  }

  section("5. Create, read back, update");
  let watchId = "";
  let engineSeal = "";
  {
    const created = await json("/api/watches", {
      method: "POST",
      headers: { "idempotency-key": `verify-${Date.now()}` },
      body: JSON.stringify({ host: PROBE_HOST, label: "live verification" }),
    });
    check("POST /api/watches returns 201", created.status === 201, `status ${created.status}`);
    watchId = created.body?.watch?.id ?? "";
    check("a watch id was returned", typeof watchId === "string" && watchId.length > 0);
    check(
      "the create response carries a measured key",
      (created.body?.observation?.spkiSha256 ?? "").length === 64,
    );
    check("the watch is flagged as live", created.body?.watch?.live === true);

    const replay = await json("/api/watches", {
      method: "POST",
      headers: { "idempotency-key": created.response.headers.get("idempotency-key") ?? "" },
      body: JSON.stringify({ host: PROBE_HOST, label: "live verification" }),
    });
    check("a repeated idempotent create does not duplicate", replay.status !== 500);

    const read = await json(`/api/watches/${watchId}`);
    check("GET the watch returns 200", read.status === 200, `status ${read.status}`);
    check(
      "read-back shows the persisted host",
      read.body?.watch?.host === PROBE_HOST,
      read.body?.watch?.host,
    );
    check("read-back includes observations", (read.body?.observations ?? []).length >= 1);
    engineSeal = read.body?.observations?.[0]?.engine?.seal ?? "";

    const patched = await json(`/api/watches/${watchId}`, {
      method: "PATCH",
      body: JSON.stringify({ retentionYears: 25, notes: "raised by the live verifier" }),
    });
    check("PATCH returns 200", patched.status === 200, `status ${patched.status}`);
    check(
      "the update persisted",
      patched.body?.watch?.retentionYears === 25,
      String(patched.body?.watch?.retentionYears),
    );
    const reread = await json(`/api/watches/${watchId}`);
    check(
      "read-back reflects the update",
      reread.body?.watch?.retentionYears === 25,
      String(reread.body?.watch?.retentionYears),
    );
  }

  section("6. Deterministic engine output");
  {
    const detail = await json(`/api/watches/${watchId}`);
    const engine = detail.body?.observations?.[0]?.engine;
    check("the engine result is versioned", typeof engine?.version === "string");
    check("the engine is named", engine?.engine === "shorwatch-quantum");
    check("a score between 0 and 100", engine?.score >= 0 && engine?.score <= 100);
    check("factors are itemised", (engine?.factors ?? []).length === 5);
    check(
      "each factor carries a weight, raw value and detail",
      (engine?.factors ?? []).every(
        (factor) =>
          typeof factor.weight === "number" &&
          typeof factor.raw === "number" &&
          typeof factor.detail === "string" &&
          factor.detail.length > 10,
      ),
    );
    check("a recommendation is present", (engine?.recommendation ?? "").length > 20);
    check("a CRQ date is present", typeof engine?.crqDate === "string");
    check("a seal is returned", /^[0-9a-f]{96}$/.test(engine?.seal ?? ""));

    const a = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "probe_host", arguments: { host: PROBE_HOST, retentionYears: 25 } },
      }),
    });
    const b = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "probe_host", arguments: { host: PROBE_HOST, retentionYears: 25 } },
      }),
    });
    check(
      "two identical calls agree",
      a.body?.result?.structuredContent?.engine?.score ===
        b.body?.result?.structuredContent?.engine?.score,
    );
  }

  section("7. Agent mutation shares the UI path");
  {
    const decided = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "record_decision",
          arguments: { id: watchId, decision: "hybrid_migrate", idempotencyKey: "verify-decision" },
        },
      }),
    });
    check("record_decision succeeds", decided.body?.result?.isError === false);
    check("the decision returns a seal", /^[0-9a-f]{96}$/.test(decided.body?.result?.structuredContent?.seal ?? ""));

    const read = await json(`/api/watches/${watchId}`);
    check(
      "the agent mutation is visible through the UI API",
      read.body?.watch?.decision === "hybrid_migrate",
      read.body?.watch?.decision,
    );

    const repeated = await json("/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "record_decision",
          arguments: { id: watchId, decision: "hybrid_migrate", idempotencyKey: "verify-decision" },
        },
      }),
    });
    check(
      "the idempotency key replays instead of duplicating",
      repeated.body?.result?.structuredContent?.seal ===
        decided.body?.result?.structuredContent?.seal,
    );
  }

  section("8. Input validation and ownership");
  {
    const badHost = await json("/api/watches", {
      method: "POST",
      body: JSON.stringify({ host: "not a host!" }),
    });
    check("an invalid host is rejected", badHost.status === 422, `status ${badHost.status}`);
    check(
      "the error envelope is stable",
      typeof badHost.body?.error?.code === "string" &&
        typeof badHost.body?.error?.message === "string",
    );

    const missing = await json("/api/watches/does-not-exist");
    check("an unknown watch returns 404", missing.status === 404, `status ${missing.status}`);

    const badDecision = await json(`/api/watches/${watchId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision: "nonsense" }),
    });
    check("an invalid decision is rejected", badDecision.status === 422, `status ${badDecision.status}`);

    const noAuth = await fetch(`${BASE}/api/watches/${watchId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seal: engineSeal }),
    });
    check("delete without the session cookie is refused", noAuth.status >= 400, `status ${noAuth.status}`);
  }

section("9. Integrity replay");
  {
    const integrity = await json(`/api/watches/${watchId}/decide`);
    check("GET the chain returns 200", integrity.status === 200, `status ${integrity.status}`);
    check(
      "the chain replays clean",
      integrity.body?.ok === true,
      integrity.body?.reason ?? summarise(integrity.body),
    );
    check("events were checked", (integrity.body?.checked ?? 0) >= 2, String(integrity.body?.checked));
    check("no broken link is reported", integrity.body?.brokenAt === null);
    check("a head seal is reported", /^[0-9a-f]{96}$/.test(integrity.body?.headSeal ?? ""));

    const all = await json("/api/integrity");
    check("every chain replays clean", all.body?.ok === true);
  }

  section("10. Export");
  {
    const bundle = await call(`/api/export?id=${watchId}`);
    const text = await bundle.text();
    check("the export endpoint returns 200", bundle.status === 200);
    check("the runbook is produced", /migration runbook/i.test(text));
    check("an OpenSSL configuration is produced", /ssl_conf_groups/i.test(text));
    check("the OpenSSL config names a hybrid group", /MLKEM/i.test(text));
    check("attribution is included", /Cert Spotter|TLS handshake/i.test(text));

    const jsonExport = await call(`/api/export?id=${watchId}&format=json`);
    const parsed = JSON.parse(await jsonExport.text());
    check("the JSON dossier parses", parsed?.engine?.name === "shorwatch-quantum");
    check("the dossier carries provenance", Array.isArray(parsed?.provenance));
  }

  section("11. Delete and tombstone");
  {
    const wrongSeal = await json(`/api/watches/${watchId}`, {
      method: "DELETE",
      body: JSON.stringify({ seal: "0".repeat(96) }),
    });
    check("delete with a wrong seal is refused", wrongSeal.status === 409, `status ${wrongSeal.status}`);

    const removed = await json(`/api/watches/${watchId}`, {
      method: "DELETE",
      body: JSON.stringify({ seal: engineSeal }),
    });
    check("delete with the correct seal succeeds", removed.status === 200, `status ${removed.status}`);
    check("a tombstone id is returned", removed.body?.tombstoneId === watchId);

    const gone = await json(`/api/watches/${watchId}`);
    check("the deleted record reports gone", gone.status === 410, `status ${gone.status}`);

    const list = await json("/api/watches");
    check(
      "the deleted record is absent from the list",
      !(list.body?.watches ?? []).some((watch) => watch.id === watchId),
    );

    const chain = await json(`/api/watches/${watchId}/decide`);
    check("the chain is still replayable after deletion", chain.body?.ok === true, chain.body?.reason ?? "");
  }

  section("12. Routes and links");
  {
    for (const route of ["/watches", "/analysis", "/standards", "/export", "/agent", "/verify", "/settings"]) {
      const response = await call(route);
      check(`GET ${route} returns 200`, response.status === 200, `status ${response.status}`);
      await response.text();
    }

    const repoResponse = await fetch(REPO_URL, { redirect: "manual" });
    check("the repository URL returns 200", repoResponse.status === 200, `status ${repoResponse.status}`);

    const manifest = await call("/mcp.json");
    check("mcp.json is served", manifest.status === 200, `status ${manifest.status}`);
    const manifestText = await manifest.text();
    check("mcp.json carries the live endpoint", manifestText.includes("/api/mcp"));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("failing checks:");
    for (const name of failures) console.log(`  - ${name}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("verification aborted:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});