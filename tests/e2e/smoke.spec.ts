import { test, expect } from "@playwright/test";

// Smoke: the cockpit boots in mock mode, the fixture sessions reach the grid
// through the real reducer + WS pipeline, and the main surfaces render.
// Screenshots double as the README visuals (regenerated on every run).

test("dashboard renders the mock fleet", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator("button.new-session")).toBeVisible();
  // Quota gauges always render (skeleton or data), never vanish.
  await expect(page.getByTestId("quota-group")).toBeVisible();
  // Mock fixtures replay through the reducer; at least one tile must land.
  await expect(page.locator("[class*='tile']").first()).toBeVisible({ timeout: 15_000 });
  // Let the replay animate a few states before shooting the hero image.
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: ".github/assets/shot-dashboard.png", fullPage: false });
});

test("metrics page renders and serves from the index", async ({ page }) => {
  const res = await page.request.get("/api/metrics");
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as { sessions: unknown[] };
  expect(Array.isArray(body.sessions)).toBeTruthy();

  await page.goto("/metrics");
  await expect(page.getByText(/est\. cost/i).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: ".github/assets/shot-metrics.png", fullPage: false });
});

test("health and quotas endpoints answer", async ({ page }) => {
  const health = await page.request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const h = await health.json() as { ok: boolean; mock: boolean };
  expect(h.ok).toBe(true);
  expect(h.mock).toBe(true);

  const quotas = await page.request.get("/api/quotas");
  expect(quotas.ok()).toBeTruthy();
});
