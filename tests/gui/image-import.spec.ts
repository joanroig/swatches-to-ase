import path from "node:path";

import playwright from "@playwright/test";

const { expect, test } = playwright;

const IMAGE = path.resolve("tests/fixtures/quadrants.png");

/** The fixture is four solid quadrants, so extraction has a known right answer. */
const QUADRANTS = ["E0C79C", "0C0F05", "6FD08C", "7B9EA8"];

const openImageImport = async (page) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator("#open-import").click();
  await expect(page.locator("#import-modal")).toHaveAttribute("aria-hidden", "false");
  const imageSource = page.locator('input[name="import-source"][value="image"]');
  await page.locator(".segmented-option", { has: imageSource }).click();
  await expect(imageSource).toBeChecked();
  await page.locator("#image-input").setInputFiles(IMAGE);
  await expect(page.locator("#image-stage")).toBeVisible();
};

const stripHexes = (page) =>
  page
    .locator(".image-chip")
    .allInnerTexts()
    .then((values: string[]) => values.map((value) => value.trim()));

test("automatic extraction finds the image's colors", async ({ page }) => {
  await openImageImport(page);
  await page.locator("#image-count").fill("4");
  await expect.poll(() => stripHexes(page)).toHaveLength(4);

  const found = await stripHexes(page);
  // Every quadrant color should be represented, in some order.
  QUADRANTS.forEach((hex) => expect(found).toContain(hex));
});

test("the color count acts as a ceiling", async ({ page }) => {
  await openImageImport(page);
  await page.locator("#image-count").fill("2");
  await expect.poll(() => stripHexes(page).then((hexes) => hexes.length)).toBe(2);

  // The fixture only holds four colors, so raising the ceiling cannot invent more.
  await page.locator("#image-count").fill("12");
  await expect.poll(() => stripHexes(page).then((hexes) => hexes.length)).toBe(4);
});

test("merging similar colors reduces near-duplicates", async ({ page }) => {
  await openImageImport(page);
  await page.locator("#image-count").fill("16");
  await page.locator("#image-similarity").fill("0");
  const loose = await stripHexes(page);
  await page.locator("#image-similarity").fill("40");
  const merged = await stripHexes(page);
  // The fixture only holds four distinct colors, so aggressive merging must collapse to them.
  expect(merged.length).toBeLessThanOrEqual(loose.length);
  expect(merged.length).toBeLessThanOrEqual(4);
});

test("picked points sample exactly where they are placed", async ({ page }) => {
  await openImageImport(page);
  await page.locator('input[name="image-mode"][value="points"]').check({ force: true });
  await expect(page.locator("#image-points-hint")).toBeVisible();

  const box = (await page.locator("#image-canvas").boundingBox())!;
  // Top-left and bottom-right quadrants.
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.75);

  await expect(page.locator(".image-point")).toHaveCount(2);
  expect(await stripHexes(page)).toEqual(["E0C79C", "7B9EA8"]);

  // Clicking a marker removes it.
  await page.locator(".image-point").first().click();
  await expect(page.locator(".image-point")).toHaveCount(1);
  expect(await stripHexes(page)).toEqual(["7B9EA8"]);
});

test("creating a palette adds it to the library", async ({ page }) => {
  await openImageImport(page);
  await page.locator("#image-count").fill("4");
  await expect.poll(() => stripHexes(page)).toHaveLength(4);
  await page.locator("#image-create").click();

  await expect(page.locator("#import-modal")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".palette-card")).toHaveCount(1);
  await expect(page.locator(".palette-card .palette-count")).toHaveText("4 colors");
});
