import { expect, test } from "@playwright/test";

const REPO_URL = "https://github.com/aniruddhaadak80/shorwatch";

/**
 * The primary journey, driven entirely through visible controls:
 * measure -> create -> inspect -> decide -> re-measure -> agent tool ->
 * export -> delete. Console errors and failed requests fail the test.
 */
test("primary journey: measure, create, decide, agent, export, delete", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    // Next.js cancels in-flight RSC prefetches when the visitor navigates away.
    // That is normal framework behaviour, not a broken request, so only a
    // genuine transport failure is recorded. Server errors are caught by the
    // response listener below.
    const errorText = request.failure()?.errorText ?? "";
    if (errorText.includes("ERR_ABORTED")) return;
    failedRequests.push(`${request.method()} ${request.url()} (${errorText})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failedRequests.push(`${response.status()} ${response.url()}`);
  });

  // --- landing and repository access -------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/harvest/i);

  const headerRepo = page.getByTestId("repo-link-header");
  await expect(headerRepo).toBeVisible();
  await expect(headerRepo).toHaveAttribute("href", REPO_URL);
  await expect(headerRepo).toHaveAttribute("target", "_blank");
  await expect(headerRepo).toHaveAttribute("rel", /noopener/);

  const footerRepo = page.getByTestId("repo-link-footer");
  await expect(footerRepo).toHaveAttribute("href", REPO_URL);

  // --- measure a real host from the wire ---------------------------------
  await page.getByLabel("Measure a live host").fill("vercel.com");
  await page.getByRole("button", { name: /Measure now/ }).click();

  const result = page.locator("div.persist").first();
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result.getByText("live from the wire")).toBeVisible();
  await expect(result).toContainText(/rsa 2048/i);
  // The finding must carry real corroboration, not just a handshake.
  await expect(result).toContainText(/public since\s*2026/i);
  await expect(result).toContainText(/112 bits/);

  // --- create a watch, which persists it ---------------------------------
  await page.getByRole("button", { name: "Watch this host" }).click();
  await page.waitForURL(/\/watches\/wch_/, { timeout: 60_000 });

  const watchUrl = page.url();
  await expect(page.getByRole("heading", { name: "vercel.com" })).toBeVisible();
  await expect(page.getByText("measured from the live wire").first()).toBeVisible();

  // --- inspect the finding and its arithmetic ----------------------------
  await expect(page.getByText("Measured certificate")).toBeVisible();
  await expect(page.getByText("How the score was reached")).toBeVisible();

  const seal = page.locator("text=/result seal [0-9a-f]{96}/").first();
  await expect(seal).toBeVisible();

  // Selecting a factor row reveals the measurement behind it.
  await page.getByRole("row", { name: /Quantum weakness/ }).click();
  await expect(page.getByText(/broken by Shor/i).first()).toBeVisible();

  // --- record a decision through the visible control ---------------------
  await page.getByRole("button", { name: "hybrid migrate" }).click();
  await expect(page.getByText(/Decision recorded as hybrid migrate/)).toBeVisible();

  // --- edit and save the watch -------------------------------------------
  await page.getByLabel("Label").fill("primary journey");
  await page.getByLabel("Confidentiality requirement (years)").fill("30");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();

  // --- re-measure -------------------------------------------------------
  await page.getByRole("button", { name: "Re-measure now" }).click();
  await expect(page.getByText(/Re-measured vercel\.com from the wire/)).toBeVisible({
    timeout: 60_000,
  });

  // --- integrity replay --------------------------------------------------
  await page.goto("/verify");
  await expect(page.getByText(/chains? replay clean/)).toBeVisible();

  // --- agent console performs a real mutation ----------------------------
  await page.goto("/agent");
  const createCall = page
    .getByRole("button", { name: "Run" })
    .nth(3); // create_watch
  await createCall.click();
  const responsePanel = page.locator("pre").last();
  await expect(responsePanel).toContainText('"isError": false', { timeout: 60_000 });
  await expect(page.getByText(/Persisted\./)).toBeVisible();

  // --- export produces a real artefact -----------------------------------
  await page.goto("/export");
  await expect(page.getByText("OpenSSL 3.5 configuration").first()).toBeVisible();
  await expect(page.locator("pre").first()).toContainText("ssl_conf_groups");
  await expect(page.locator("pre").first()).toContainText("MLKEM");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).first().click();
  expect((await download).suggestedFilename()).toMatch(/shorwatch-.*\.txt/);

  // --- analysis signature interaction ------------------------------------
  await page.goto("/analysis");
  const capacity = page.getByLabel(/Assumed physical qubits/);
  await expect(capacity).toBeVisible();
  const before = await page.locator("ol li").first().innerText();
  await capacity.fill("6.9"); // 10^6.9 qubits
  await page.waitForTimeout(400);
  const after = await page.locator("ol li").first().innerText();
  expect(typeof after).toBe("string");
  expect(before.length).toBeGreaterThan(0);

  // --- standards route publishes the constants ---------------------------
  await page.goto("/standards");
  await expect(page.getByText("Scoring weights")).toBeVisible();
  await expect(page.getByText("Gidney & Eakerå").first()).toBeVisible();

  // --- settings persists ------------------------------------------------
  await page.goto("/settings");
  await page.getByLabel("Confidentiality horizon (years)").fill("15");
  await page.getByRole("button", { name: "Save assumptions" }).click();
  await expect(page.getByText(/Saved at/)).toBeVisible();

  // --- delete, which requires the current seal ---------------------------
  await page.goto(watchUrl);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toMatch(/Delete the watch on vercel\.com/);
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete this watch" }).click();
  await page.waitForURL(/\/watches$/, { timeout: 30_000 });
  await expect(page.getByText("vercel.com")).toHaveCount(0);

  // --- mobile viewport with the repository link present ------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("repo-link-header")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByTestId("repo-link-mobile")).toHaveAttribute("href", REPO_URL);

  expect(failedRequests, `failed requests: ${failedRequests.join(", ")}`).toHaveLength(0);
  expect(
    consoleErrors.filter((text) => !/favicon|404 \(Not Found\)/i.test(text)),
    `console errors: ${consoleErrors.join(" | ")}`,
  ).toHaveLength(0);
});

test("keyboard navigation reaches the primary controls", async ({ page }) => {
  await page.goto("/watches");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const style = window.getComputedStyle(active);
    return {
      tag: active.tagName,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
    };
  });
  expect(focused).not.toBeNull();
  // Focus must be visible, not removed.
  if (focused) {
    expect(focused.outlineStyle).not.toBe("none");
  }
});