import path from "node:path";
import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

test("importing a swatches file populates the palette list and view", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");

  await expect(page.locator("#open-export")).toBeDisabled();

  await page.click("#open-import");
  const filePath = path.resolve(
    "examples/palette-in",
    "Kitchen_Plant.swatches"
  );
  await page.setInputFiles("#file-input", filePath);

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator("#open-export")).toBeEnabled();
  await expect(card.locator(".palette-count")).toContainText("colors");

  await page.locator("#import-modal button[data-close=\"true\"]").click();

  await card.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#view-modal")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
  await expect(page.locator("#view-subtitle")).toContainText("colors");
});
