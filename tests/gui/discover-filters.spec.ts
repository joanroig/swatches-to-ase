import playwright from "@playwright/test";

const { expect, test } = playwright;

const openDiscoverFilters = async (page) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator('[data-view-target="discover"]:visible').first().click();
  await page.locator("#discover-filter-toggle").click();
  await expect(page.locator(".discover-filter-panel")).toBeVisible();
};

test("loading cards reserve the same control rows as Discover results", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  const geometry = await page.locator("#discover-list").evaluate(async (list) => {
    const discoveryUrl = new URL("/src/app/cloud/discovery.ts", window.location.origin).href;
    const stateUrl = new URL("/src/app/state.ts", window.location.origin).href;
    const [{ renderDiscovery }, { discoveryState }] = await Promise.all([
      import(/* @vite-ignore */ discoveryUrl),
      import(/* @vite-ignore */ stateUrl),
    ]);
    discoveryState.palettes = [];
    discoveryState.loading = true;
    renderDiscovery();
    document.querySelector<HTMLElement>('[data-view-section="library"]')?.classList.remove("is-active");
    document.querySelector<HTMLElement>('[data-view-section="discover"]')?.classList.add("is-active");
    const skeletons = Array.from(list.querySelectorAll<HTMLElement>(".discover-card.is-skeleton"));
    const card = skeletons[0]!;
    const cardRect = card.getBoundingClientRect();
    const headerRect = card.querySelector(".discover-header")!.getBoundingClientRect();
    const footerRect = card.querySelector(".discover-footer")!.getBoundingClientRect();
    const controlHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--control-md"));
    return {
      skeletonCount: skeletons.length,
      busy: list.getAttribute("aria-busy"),
      cardHeight: Math.round(cardRect.height),
      headerHeight: Math.round(headerRect.height),
      footerHeight: Math.round(footerRect.height),
      controlHeight: Math.round(controlHeight),
    };
  });

  expect(geometry.skeletonCount).toBe(4);
  expect(geometry.busy).toBe("true");
  expect(geometry.headerHeight).toBe(geometry.controlHeight);
  expect(geometry.footerHeight).toBe(geometry.controlHeight);
  expect(geometry.cardHeight).toBe(162);
});

/* The rows are built from the constants in `palette-traits.ts`, so a mismatch shows up as a count. */
test("the panel offers sort, style and color", async ({ page }) => {
  await openDiscoverFilters(page);

  await expect(page.locator(".discover-filter-group")).toHaveCount(3);
  // The caps are `text-transform`, so the text itself is title case.
  await expect(page.locator(".discover-filter-label")).toHaveText(["Sort", "Style", "Color"]);
  // 5 sorts, 8 styles + Any, 12 colors + Any.
  await expect(page.locator(".discover-filter-option")).toHaveCount(27);
  await expect(page.locator(".discover-filter-swatch")).toHaveCount(12);
});

test("a chosen filter is counted on the button and clicking it again clears it", async ({ page }) => {
  await openDiscoverFilters(page);
  const toggle = page.locator("#discover-filter-toggle");
  const warm = page.locator(".discover-filter-option", { hasText: "Warm" }).first();

  await warm.click();
  await expect(warm).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".discover-filter-count")).toHaveText("1");
  await expect(toggle).toHaveClass(/has-filters/);

  // Style and color narrow independently, and the panel stays open for the second choice.
  await page.locator(".discover-filter-option", { hasText: "Green" }).first().click();
  await expect(page.locator(".discover-filter-count")).toHaveText("2");
  await expect(page.locator(".discover-filter-panel")).toBeVisible();

  await warm.click();
  await expect(page.locator(".discover-filter-count")).toHaveText("1");

  await page.locator(".discover-filter-clear").click();
  await expect(page.locator(".discover-filter-count")).toHaveText("");
  await expect(toggle).not.toHaveClass(/has-filters/);
});
