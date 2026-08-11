import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

test("theme selection updates body dataset", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");

  await page.locator('[data-action="open-settings"]:visible').click();
  await expect(page.locator("#settings-modal")).toHaveAttribute("aria-hidden", "false");

  await page.selectOption("#theme-select", "noir");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "noir");
});

test("closed modals cannot receive focus", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");

  const settings = page.locator("#settings-modal");
  await expect(settings).toHaveAttribute("aria-hidden", "true");
  await expect(settings).toHaveAttribute("inert", "");

  await page.locator('[data-action="open-settings"]:visible').click();
  await expect(settings).toHaveAttribute("aria-hidden", "false");
  await expect(settings).not.toHaveAttribute("inert", "");
});

test("a local-only startup does not download Firebase", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const firebaseResources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.toLowerCase().includes("firebase")),
  );
  expect(firebaseResources).toEqual([]);
});

for (const [theme, background] of [
  ["noir", "rgb(15, 17, 26)"],
  ["graphite", "rgb(20, 24, 34)"],
  ["aurora", "rgb(11, 19, 33)"],
] as const) {
  test(`${theme} paints its dark background before app styles load`, async ({ page }) => {
    await page.addInitScript((savedTheme) => {
      localStorage.setItem("palette-studio.preferences", JSON.stringify({ theme: savedTheme }));
    }, theme);
    await page.route("**/src/style.scss", (route) => route.abort());

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).toHaveCSS("background-color", background);
  });
}

test("system dark paints a dark background before app styles load", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ theme: "system" }));
  });
  await page.route("**/src/style.scss", (route) => route.abort());

  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(15, 17, 26)");
});
