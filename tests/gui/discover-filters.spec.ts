import playwright from "@playwright/test";

const { expect, test } = playwright;

const openDiscoverFilters = async (page) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator('[data-view-target="discover"]:visible').first().click();
  await page.locator("#discover-filter-toggle").click();
  await expect(page.locator(".discover-filter-panel")).toBeVisible();
};

/* The rows are built from the constants in `palette-traits.ts`, so a mismatch shows up as a count. */
test("the panel offers sort, style and colour", async ({ page }) => {
  await openDiscoverFilters(page);

  await expect(page.locator(".discover-filter-group")).toHaveCount(3);
  // The caps are `text-transform`, so the text itself is title case.
  await expect(page.locator(".discover-filter-label")).toHaveText(["Sort", "Style", "Color"]);
  // 5 sorts, 8 styles + Any, 12 colours + Any.
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

  // Style and colour narrow independently, and the panel stays open for the second choice.
  await page.locator(".discover-filter-option", { hasText: "Green" }).first().click();
  await expect(page.locator(".discover-filter-count")).toHaveText("2");
  await expect(page.locator(".discover-filter-panel")).toBeVisible();

  await warm.click();
  await expect(page.locator(".discover-filter-count")).toHaveText("1");

  await page.locator(".discover-filter-clear").click();
  await expect(page.locator(".discover-filter-count")).toHaveText("");
  await expect(toggle).not.toHaveClass(/has-filters/);
});
