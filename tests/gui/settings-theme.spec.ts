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

/*
 * A relabel pass must leave alone the controls that already say the right thing.
 *
 * A cloud sync re-applies the remote preferences on every payload, which relabels every control in
 * the app — and that used to tear out each icon and build a new one regardless. Signed in it
 * happens twice on a reload, which is exactly what people saw flickering.
 */
test("relabelling does not rebuild controls that have not changed", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  // Tag the standing controls — the rail and the topbar. The lists are rebuilt wholesale by a real
  // language change and are expected to be; these are the ones that had no reason to move.
  const tagged = await page.evaluate(() => {
    const icons = Array.from(document.querySelectorAll(".sidebar-stack svg.icon, .topbar svg.icon"));
    icons.forEach((icon, index) => icon.setAttribute("data-tag", String(index)));
    const avatar = document.querySelector<HTMLImageElement>("[data-cloud-avatar]");
    const w = window as unknown as { __avatarLoads: number };
    w.__avatarLoads = 0;
    avatar?.addEventListener("load", () => (w.__avatarLoads += 1));
    return icons.length;
  });
  expect(tagged).toBeGreaterThan(4);

  // The same language the app is already showing: nothing has changed, so nothing should be rebuilt.
  await page.locator("#language-select").selectOption("en");
  await page.waitForTimeout(300);

  expect(await page.locator(".sidebar-stack svg.icon[data-tag], .topbar svg.icon[data-tag]").count()).toBe(tagged);
  expect(await page.evaluate(() => (window as unknown as { __avatarLoads: number }).__avatarLoads)).toBe(0);
});
