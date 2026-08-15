import playwright from "@playwright/test";
import path from "node:path";

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
  const filePath = path.resolve("examples/palette-in", "Kitchen_Plant.swatches");
  await page.setInputFiles("#file-input", filePath);

  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator("#open-export")).toBeEnabled();
  await expect(card.locator(".palette-count")).toContainText("colors");

  await page.locator('#import-modal button[data-close="true"]').click();

  await card.click();
  await expect(page.locator("#view-modal")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#view-subtitle")).toContainText("colors");
});

test("a stylesheet and a hex list import like any other palette file", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");
  await page.click("#open-import");
  await page.setInputFiles("#file-input", [
    { name: "theme.css", mimeType: "text/css", buffer: Buffer.from(":root {\n  --brand-blue: #0af;\n  --brand-ink: #0f172a;\n}\n") },
    { name: "coolors.hex", mimeType: "text/plain", buffer: Buffer.from("#FF0000\n#00FF00\n#0000FF\n") },
  ]);

  await expect(page.locator(".palette-card")).toHaveCount(2);
  await expect(page.locator(".palette-card", { hasText: "theme" }).locator(".palette-count")).toHaveText("2 colors");
  await expect(page.locator(".palette-card", { hasText: "coolors" }).locator(".palette-count")).toHaveText("3 colors");
});

test("quick view switches to joined blocks and remembers the choice", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: [
          {
            id: "p0",
            name: "Forest",
            lastModified: 1,
            colors: [
              { id: "c0", name: "Forest Green", rgb: [0.04, 0.38, 0.12] },
              { id: "c1", name: "Leaf Green", rgb: [0.08, 0.64, 0.2] },
              { id: "c2", name: "Mint Green", rgb: [0.48, 0.88, 0.62] },
            ],
          },
        ],
        folders: [],
        activePaletteId: "p0",
      }),
    );
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator(".palette-card").click();

  const details = page.locator('[data-view-layout="details"]');
  const blocks = page.locator('[data-view-layout="blocks"]');
  const headerGap = await page.locator(".modal-card.modal-view").evaluate((modal) => {
    const header = modal.querySelector<HTMLElement>(".modal-header")!.getBoundingClientRect();
    const preview = modal
      .querySelector<HTMLElement>(".view-display:not(.is-hidden), .view-blocks:not(.is-hidden)")!
      .getBoundingClientRect();
    return preview.top - header.bottom;
  });
  expect(headerGap).toBeLessThanOrEqual(10);
  await expect(details).toHaveAttribute("aria-pressed", "true");
  await blocks.click();

  await expect(page.locator("#view-display")).toBeHidden();
  await expect(page.locator("#view-strip")).toBeHidden();
  await expect(page.locator("#view-blocks")).toBeVisible();
  await expect(page.locator(".view-block")).toHaveCount(3);
  await expect(page.locator("#view-blocks button")).toHaveCount(0);
  await expect(page.locator(".view-block").first().locator(".view-block-value")).toHaveText(/^#/);

  const blockEdges = await page.locator(".view-block").evaluateAll((items) =>
    items.slice(0, 2).map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }),
  );
  expect(Math.abs(blockEdges[0].bottom - blockEdges[1].top)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.getItem("palette-studio.quick-view-layout"))).toBe("blocks");

  await page.locator('#view-modal button[data-close="true"]').click();
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator(".palette-card").click();
  await expect(blocks).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#view-blocks")).toBeVisible();
});

/*
 * A failed import used to reach only the activity log, which is a panel you have to be looking at.
 * A drop that produced nothing looked like the app ignoring you.
 */
test("a file that cannot be read says so in a toast", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/");
  await page.click("#open-import");

  await page.setInputFiles("#file-input", {
    name: "broken.aco",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a palette at all"),
  });
  await expect(page.locator(".toast.error", { hasText: "broken.aco" })).toBeVisible();
  await expect(page.locator(".palette-card")).toHaveCount(0);

  await page.setInputFiles("#file-input", {
    name: "holiday.raw",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("x"),
  });
  await expect(page.locator(".toast.error", { hasText: "No supported palette files" })).toBeVisible();
});
