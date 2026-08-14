import playwright from "@playwright/test";

const { expect, test } = playwright;

const seedOnePalette = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/");
  await page.locator("#open-generate").click();
  await page.locator("#generate-style").selectOption("empty");
  await page.locator("#save-generated-palette").click();

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  return card;
};

test("export modal shows format tiles and quick actions", async ({ page }) => {
  const card = await seedOnePalette(page);
  await card.getByRole("button", { name: "Export" }).click();

  await expect(page.getByRole("heading", { name: "Export palettes" })).toBeVisible();
  await expect(page.locator("[data-export-format]")).toHaveCount(4);
  await expect(page.locator("[data-export-format='all']")).toBeEnabled();
  await expect(page.locator("[data-export-action='coolors']")).toBeEnabled();
  await expect(page.locator("[data-export-action='css'] svg")).toBeVisible();
});

/*
 * The tile is the button. Choosing a format used to select a radio and leave you to find a Download
 * button underneath, which the tile already looked like it had been.
 */
test("pressing a format tile downloads that format outright", async ({ page }) => {
  const card = await seedOnePalette(page);
  await card.getByRole("button", { name: "Export" }).click();

  const download = page.waitForEvent("download");
  await page.locator("[data-export-format='gpl']").click();

  expect((await download).suggestedFilename()).toMatch(/\.gpl$/);
});

/* More than one file per palette, so it has to arrive as one archive. */
test("the all-formats tile downloads a zip", async ({ page }) => {
  const card = await seedOnePalette(page);
  await card.getByRole("button", { name: "Export" }).click();

  const download = page.waitForEvent("download");
  await page.locator("[data-export-format='all']").click();

  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});
