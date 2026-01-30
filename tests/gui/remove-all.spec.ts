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
  await page.click("#generate-empty-button");

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator("#open-export")).toBeEnabled();

  await page.click("#remove-all-palettes");

  await expect(card).toHaveCount(0);
  await expect(page.locator("#open-export")).toBeDisabled();
});
