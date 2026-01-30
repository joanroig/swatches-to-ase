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

  await page.click("#open-settings");
  await expect(page.locator("#settings-modal")).toHaveAttribute(
    "aria-hidden",
    "false"
  );

  await page.selectOption("#theme-select", "noir");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "noir");
});
