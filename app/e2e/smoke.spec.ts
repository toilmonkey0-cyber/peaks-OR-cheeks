import { test, expect, type Page } from "@playwright/test";

const SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "K", "DEF"];

// buy one standard pack and fast-forward the choreography to the summary
async function buyAndReveal(page: Page) {
  await page.getByTestId("buy-standard").click();
  await page.getByTestId("pack-flow").dispatchEvent("pointerdown");
  await page.waitForTimeout(600);
  await page.getByTestId("pack-flow").dispatchEvent("pointerup");
  await expect(page.getByTestId("pack-summary")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("summary-done").click();
}

// slot-scan: does ANY slot currently yield pickable options? (never assigns)
async function anyPickableSlot(page: Page): Promise<boolean> {
  for (const slot of SLOTS) {
    await page.getByTestId(`slot-${slot}`).click();
    const opts = page.locator('[data-testid^="pick-"]');
    const has = (await opts.count()) > 0;
    await page.getByTestId("picker-close").click();
    if (has) return true;
  }
  return false;
}

test("pack journey: buy → reveal → collection grows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Packs" }).click();
  await page.getByTestId("buy-standard").click(); // fresh context: this is the free daily
  // fast-forward the choreography
  await page.getByTestId("pack-flow").dispatchEvent("pointerdown");
  await page.waitForTimeout(600);
  await page.getByTestId("pack-flow").dispatchEvent("pointerup");
  await expect(page.getByTestId("pack-summary")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("summary-done").click();
  const after = Number(await page.getByTestId("coin-balance").getAttribute("data-coins"));
  expect(after).toBeGreaterThanOrEqual(500); // free pack; dupes impossible; troll may add 25
  expect(after).toBeLessThanOrEqual(525);
  await page.getByRole("button", { name: "Collection" }).click();
  // first pack of a fresh save owns 5 new unique ids
  const owned = await page.locator('[data-owned="true"]').count();
  expect(owned).toBeGreaterThanOrEqual(5);
});

test("squad journey: assign + export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Packs" }).click();
  await buyAndReveal(page); // fresh context: this is the free daily
  await page.getByRole("button", { name: "Squad" }).click();
  // A single 5-card pack misses every slot position with ~13% probability,
  // which would flake the fill assertion below. Buy up to 4 MORE standard
  // packs (4×100 = 400 of the 500 starting coins) while no pickable option
  // exists; stop as soon as some slot yields options (expected 1-2 packs,
  // residual miss odds ~6e-6).
  for (let extra = 0; extra < 4 && !(await anyPickableSlot(page)); extra++) {
    await page.getByRole("button", { name: "Packs" }).click();
    await buyAndReveal(page);
    await page.getByRole("button", { name: "Squad" }).click();
  }
  // find the first slot the pulled cards can legally fill
  let filled = false;
  for (const slot of SLOTS) {
    await page.getByTestId(`slot-${slot}`).click();
    const opts = page.locator('[data-testid^="pick-"]');
    if ((await opts.count()) > 0) {
      await opts.first().click();
      filled = true;
      break;
    }
    await page.getByTestId("picker-close").click();
  }
  expect(filled).toBe(true);
  await page.getByTestId("export-copy").click();
  await expect(page.getByTestId("export-toast")).toContainText("RipPack Squad");
});
