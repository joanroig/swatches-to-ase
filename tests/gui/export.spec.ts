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
 * Everything that lands in the Downloads folder sits under Download; everything that hands the
 * palette to someone else sits under Share. They used to be one undifferentiated wall of tiles.
 */
test("quick exports are split into a download group and a share group", async ({ page }) => {
  const card = await seedOnePalette(page);
  await card.getByRole("button", { name: "Export" }).click();

  const download = page.locator(".export-section--download");
  const share = page.locator(".export-section--share");
  await expect(download.getByRole("heading", { name: "Download" })).toBeVisible();
  await expect(share.getByRole("heading", { name: "Share" })).toBeVisible();

  // The formats stay on top of their own group, with the extra downloads beneath them.
  await expect(download.locator("[data-export-format]")).toHaveCount(4);
  for (const action of ["pdf", "image", "svg", "css", "tailwind", "code", "embed"]) {
    await expect(download.locator(`[data-export-action='${action}']`)).toBeVisible();
  }
  for (const action of ["url", "coolors", "x", "pinterest"]) {
    await expect(share.locator(`[data-export-action='${action}']`)).toBeVisible();
  }
});

/* No share sheet, no button — pressing it would open nothing. */
test("the native share button only appears where the browser has a share sheet", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: () => Promise.resolve() });
  });
  const card = await seedOnePalette(page);
  await card.getByRole("button", { name: "Export" }).click();

  const shareButton = page.locator("[data-export-action='share']");
  await expect(shareButton).toBeVisible();
  // Next to the copy-link button, at the head of the share group.
  await expect(page.locator(".export-section--share [data-export-action]").nth(1)).toHaveAttribute("data-export-action", "share");
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
