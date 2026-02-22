import playwright from "@playwright/test";

const { expect, test } = playwright;

const clearStorage = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
};

const setColorValue = async (locator, value) => {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = nextValue as string;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
};

const getGeneratedPreviewHexes = async (page) => {
  const labels = page.locator(".generate-preview-swatch-hex");
  const values = await labels.allInnerTexts();
  return values.map((value) => value.trim());
};

test("new palette defaults to shade and remembers the last style", async ({ page }) => {
  await clearStorage(page);

  await page.click("#open-generate");
  await expect(page.locator("#generate-style")).toHaveValue("shade");
  await page.selectOption("#generate-style", "triadic");

  await page.reload();
  await page.click("#open-generate");
  await expect(page.locator("#generate-style")).toHaveValue("triadic");
});

test("use base color inserts base as first generated color", async ({ page }) => {
  await clearStorage(page);

  await page.click("#open-generate");
  await page.locator(".generate-base-inline label.toggle.is-compact").click();
  await setColorValue(page.locator("#generate-base-color"), "#ff0000");
  await page.click("#save-generated-palette");

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator('.color-row input[type="color"]').first()).toHaveValue("#ff0000");
});

test("format and count changes keep existing generated colors stable", async ({ page }) => {
  await clearStorage(page);

  await page.click("#open-generate");
  const initialHexes = await getGeneratedPreviewHexes(page);
  await expect(page.locator(".generate-preview-swatch")).toHaveCount(initialHexes.length);

  await page.selectOption("#generate-format", "html");
  const afterFormatHexes = await getGeneratedPreviewHexes(page);
  expect(afterFormatHexes).toEqual(initialHexes);

  await page.selectOption("#generate-count", "6");
  const afterAddHexes = await getGeneratedPreviewHexes(page);
  expect(afterAddHexes.slice(0, initialHexes.length)).toEqual(initialHexes);

  await page.selectOption("#generate-count", "4");
  const afterRemoveHexes = await getGeneratedPreviewHexes(page);
  expect(afterRemoveHexes).toEqual(initialHexes.slice(0, 4));
});

test("generate empty palette, edit colors, and apply notation", async ({ page }) => {
  await clearStorage(page);

  await page.click("#open-generate");
  await page.selectOption("#generate-style", "empty");
  await page.click("#save-generated-palette");

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
  await setColorValue(swatchInput, "#00ff88");

  const updatedValue = await page.locator(".color-card-value").first().innerText();
  expect(updatedValue).not.toBe(initialValue);
});
