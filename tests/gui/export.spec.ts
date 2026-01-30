import playwright from "@playwright/test";

const { expect, test } = playwright;

test("export modal shows quick actions and download button", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/");
  await page.locator("#open-generate").click();
  await page.locator("#generate-empty-button").click();

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Export" }).click();

  await expect(
    page.getByRole("heading", { name: "Export palettes" })
  ).toBeVisible();
  await expect(page.locator("#export-all")).toBeEnabled();
  await expect(page.locator("[data-export-action='coolors']")).toBeEnabled();
  await expect(page.locator("[data-export-action='css'] svg")).toBeVisible();
});
