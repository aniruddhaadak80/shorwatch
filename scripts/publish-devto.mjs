/**
 * Publish the DEV post.
 *
 * Written in Node rather than PowerShell because Windows PowerShell 5.1's
 * ConvertTo-Json expands a large string into a per-character structure, which
 * dev.to answers with a bare HTTP 500. JSON.stringify has no such behaviour.
 *
 * Usage: node scripts/publish-devto.mjs [--dry-run]
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const TITLE = "I built a tool that reads the public key a server is actually serving";
const DESCRIPTION =
  "Reads the live TLS key, joins it to Certificate Transparency, dates the quantum threat.";
const TAGS = ["quantumcomputing", "cryptography", "cybersecurity", "hacktoberfest"];
const MAIN_IMAGE =
  "https://raw.githubusercontent.com/aniruddhaadak80/shorwatch/main/docs/screenshot-landing.png";
const LIVE_URL = "https://shorwatch-aniruddha-adaks-projects.vercel.app";
const REPO_URL = "https://github.com/aniruddhaadak80/shorwatch";

/** dev.to limits, checked locally so a violation never becomes an opaque 500. */
const LIMITS = { titleMin: 4, titleMax: 128, descriptionMax: 100, bodyMax: 40000, tagMax: 4 };

function assertLimits(article) {
  const problems = [];
  if (article.title.length < LIMITS.titleMin || article.title.length > LIMITS.titleMax) {
    problems.push(`title must be ${LIMITS.titleMin}-${LIMITS.titleMax} chars`);
  }
  if (article.description.length > LIMITS.descriptionMax) {
    problems.push(`description must be <= ${LIMITS.descriptionMax} chars`);
  }
  if (article.body_markdown.length > LIMITS.bodyMax) {
    problems.push(`body must be <= ${LIMITS.bodyMax} chars`);
  }
  if (article.tags.length > LIMITS.tagMax) {
    problems.push(`at most ${LIMITS.tagMax} tags`);
  }
  for (const tag of article.tags) {
    // dev.to rejects hyphens and any non-alphanumeric character in a tag.\n    if (!/^[a-z0-9]+$/.test(tag)) problems.push(`tag "${tag}" must be lowercase alphanumeric with no hyphens`);
  }
  if (problems.length > 0) throw new Error(problems.join("; "));
}

async function apiKey() {
  const text = await readFile(join(homedir(), ".devto", "api-key.txt"), "utf8");
  const key = text.trim().split(/\r?\n/).pop()?.trim();
  if (!key) throw new Error("no DEV API key found");
  return key;
}

async function call(path, key, init) {
  const response = await fetch(`https://dev.to/api${path}`, {
    ...init,
    headers: { "api-key": key, "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const dryRun = process.argv.includes("--dry-run");

const markdown = await readFile(resolve(root, "docs", "devto-post.md"), "utf8");

const article = {
  title: TITLE,
  description: DESCRIPTION,
  published: true,
  body_markdown: markdown,
  tags: TAGS,
  main_image: MAIN_IMAGE,
  series: "Quantum Security",
};

assertLimits(article);

console.log(`title:       ${article.title} (${article.title.length})`);
console.log(`description: ${article.description.length} chars`);
console.log(`body:        ${article.body_markdown.length} chars`);
console.log(`tags:        ${article.tags.join(", ")}`);

if (dryRun) {
  console.log("\n--dry-run: limits validated, nothing posted");
  process.exit(0);
}

const key = await apiKey();

// Confirm the key works before spending a request on a large body.
const me = await call("/articles/me?per_page=1", key);
if (me.status !== 200) {
  console.error(`DEV key rejected with ${me.status}. Regenerate at https://dev.to/settings/extensions`);
  process.exit(1);
}
console.log(`\nauthenticated as ${me.body?.username ?? `user ${me.body?.id}`}`);

const result = await call("/articles", key, {
  method: "POST",
  body: JSON.stringify({ article }),
});

if (result.status >= 200 && result.status < 300) {
  console.log(`\npublished`);
  console.log(`id:    ${result.body.id}`);
  console.log(`url:   ${result.body.url}`);
  console.log(`edit:  ${result.body.editable_app_url ?? "(use PUT /articles/" + result.body.id + ")"}`);
  console.log(`\nlive:  ${LIVE_URL}`);
  console.log(`repo:  ${REPO_URL}`);
} else {
  console.error(`\npublish failed with ${result.status}`);
  console.error(typeof result.body === "string" ? result.body.slice(0, 800) : JSON.stringify(result.body, null, 2).slice(0, 2000));
  process.exitCode = 1;
}