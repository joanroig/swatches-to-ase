import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

test("generate empty palette, edit colors, and apply notation", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");

  await page.click("#open-generate");
  await page.click("#generate-empty-button");

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator("#open-export")).toBeEnabled();

  await card.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#editor-modal")).toHaveAttribute("aria-hidden", "false");

  await page.click("#add-color");
  await expect(page.locator('.color-row input[type="text"]')).toHaveCount(0);
  await expect(page.locator(".color-card-name").first()).not.toHaveText("");

  await page.locator("#color-notation-editor").selectOption("rgb");
  await expect(page.locator(".color-card-value").first()).toContainText(",");

  const initialValue = await page.locator(".color-card-value").first().innerText();
  const swatchInput = page.locator('.color-row input[type="color"]').first();
  await swatchInput.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value as string;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, "#00ff88");

  const updatedValue = await page.locator(".color-card-value").first().innerText();
  expect(updatedValue).not.toBe(initialValue);
});
