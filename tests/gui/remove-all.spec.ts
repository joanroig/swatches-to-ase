import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

test("remove all clears palettes after confirmation", async ({ page }) => {
  await resetStorage(page);
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/");
  await page.click("#open-generate");
  await page.selectOption("#generate-style", "empty");
  await page.click("#save-generated-palette");

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator("#open-export")).toBeEnabled();

  await page.locator('[data-action="open-settings"]:visible').click();
  await expect(page.locator("#settings-modal")).toHaveAttribute("aria-hidden", "false");
  await page.click("#remove-all-palettes");

  await expect(card).toHaveCount(0);
  await expect(page.locator("#open-export")).toBeDisabled();
});

/*
 * A folder belongs to the library that holds it.
 *
 * Clearing the palettes used to leave every folder standing, so the library came back as a shelf of
 * empty collections nobody had made — and signing in then merged those ghosts into the account.
 */
test("remove all takes the folders with the palettes", async ({ page }) => {
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: [{ id: "p0", name: "Filed", folderId: "f0", lastModified: 1, colors: [{ id: "c0", name: "c", rgb: [0.2, 0.4, 0.8] }] }],
        folders: [
          { id: "f0", name: "Brand" },
          { id: "f1", name: "Empty" },
        ],
        activePaletteId: "p0",
      }),
    );
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".collection-box")).toHaveCount(2);

  await page.locator('[data-action="open-settings"]:visible').click();
  await page.click("#remove-all-palettes");

  await expect(page.locator(".palette-card")).toHaveCount(0);
  await expect(page.locator(".collection-box")).toHaveCount(0);
  // And it stays cleared: the folders must not come back from storage on the next load.
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".collection-box")).toHaveCount(0);
});
