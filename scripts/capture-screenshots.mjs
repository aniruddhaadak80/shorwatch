/**
 * Capture product screenshots from the production deployment.
 *
 *   node scripts/capture-screenshots.mjs [baseUrl]
 *
 * Writes to docs/. These show useful state — a real measurement, the factor
 * ledger, the resource curve — rather than an atmospheric hero.
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = (process.argv[2] ?? "https://shorwatch-aniruddha-adaks-projects.vercel.app").replace(
  /\/+$/,
  "",
);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "docs");

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

async function capture(page, path, file, options = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
  if (options.prepare) await options.prepare(page);
  await page.waitForTimeout(options.settle ?? 600);
  await page.screenshot({
    path: resolve(outDir, file),
    fullPage: options.fullPage ?? false,
  });
  console.log(`captured ${file}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  // Landing with a completed live measurement.
  await capture(page, "/", "screenshot-landing.png", {
    prepare: async (target) => {
      await target.getByLabel("Measure a live host").fill("vercel.com");
      await target.getByRole("button", { name: /Measure now/ }).click();
      await target.locator("div.persist").first().waitFor({ timeout: 60_000 });
      await target.locator("div.persist").first().scrollIntoViewIfNeeded();
    },
    settle: 1200,
  });

  // The workspace, after creating a real watch.
  await capture(page, "/watches", "screenshot-workspace.png", {
    prepare: async (target) => {
      await target.getByLabel("Host name").fill("arxiv.org");
      await target.getByRole("button", { name: "Add and measure" }).click();
      await target.waitForURL(/\/watches\/wch_/, { timeout: 60_000 });
    },
  });

  // Detail with the factor ledger expanded on a real finding.
  await capture(page, page.url().replace(BASE, "") || "/watches", "screenshot-detail.png", {
    prepare: async (target) => {
      const row = target.getByRole("row", { name: /Quantum weakness/ });
      if (await row.count()) await row.first().click();
      await target.waitForTimeout(400);
    },
    fullPage: true,
  });

  // The signature interaction.
  await capture(page, "/analysis", "screenshot-analysis.png", { fullPage: true });

  // The agent console after a real call.
  await capture(page, "/agent", "screenshot-agent.png", {
    prepare: async (target) => {
      await target.getByRole("button", { name: "Run" }).first().click();
      await target.locator("pre").last().waitFor({ timeout: 60_000 });
      await target.waitForTimeout(2500);
    },
    fullPage: true,
  });

  await capture(page, "/standards", "screenshot-standards.png", { fullPage: true });

  await context.close();

  // Mobile, including the navigation drawer with the repository link.
  const mobileContext = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 3 });
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.getByRole("button", { name: "Open menu" }).click();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: resolve(outDir, "screenshot-mobile-nav.png") });
  console.log("captured screenshot-mobile-nav.png");
  await mobileContext.close();

  await browser.close();

  const realErrors = consoleErrors.filter((text) => !/favicon/i.test(text));
  if (realErrors.length > 0) {
    console.error("console errors during capture:", realErrors.join(" | "));
    process.exitCode = 1;
  } else {
    console.log("no console errors during capture");
  }
}

main().catch((error) => {
  console.error("capture failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});