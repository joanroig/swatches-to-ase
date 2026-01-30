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

  await page.click("#open-settings");
  await expect(page.locator("#settings-modal")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
  await page
    .locator("#settings-modal label.toggle", { hasText: "Auto-rename" })
    .click();
  await page.locator("#settings-modal button[data-close=\"true\"]").click();

  await page.click("#open-generate");
  await page.click("#generate-empty-button");

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator("#open-export")).toBeEnabled();

  await card.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#editor-modal")).toHaveAttribute(
    "aria-hidden",
    "false"
  );

  await page.click("#add-color");
  const nameInput = page.locator(".color-row input[type=\"text\"]").first();
  await nameInput.fill("Sunset");
  await expect(page.locator(".preview-name").first()).toHaveText("Sunset");

  await page.locator("#color-notation-editor").selectOption("rgb");
  await expect(page.locator(".color-hex").first()).toContainText(",");

  const swatchInput = page.locator(".color-row input[type=\"color\"]").first();
  await swatchInput.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value as string;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, "#00ff88");

  const updatedName = await nameInput.inputValue();
  expect(updatedName).not.toBe("");
  expect(updatedName).not.toBe("Color 1");
});
