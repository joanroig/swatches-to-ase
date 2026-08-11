import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

test("shared palette URL imports after confirmation", async ({ page }) => {
  await resetStorage(page);
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  const payload = {
    name: "Shared",
    colors: [
      { name: "Lagoon", hex: "00aaff" },
      { name: "Citrus", hex: "f2c94c" },
    ],
  };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(payload)), "utf8").toString("base64");

  await page.goto(`/?import=${encodeURIComponent(encoded)}`);

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".palette-title")).toHaveText("Shared");
  await expect(card.locator(".palette-count")).toContainText("colors");
});

test("public assets resolve from a shared URL with a trailing slash", async ({ page }) => {
  await resetStorage(page);
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/00aaff-f2c94c/");

  await expect(page.locator(".brand-logo").first()).toHaveJSProperty("complete", true);
  await expect
    .poll(() => page.locator(".brand-logo").first().evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => new URL("icons/settings.svg", document.baseURI).pathname))
    .toBe("/icons/settings.svg");
});
