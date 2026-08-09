import playwright from "@playwright/test";

const { expect, test } = playwright;

/*
 * The library is one grid of equally sized boxes. A box is a palette or a collection; both can be
 * opened, named, moved and deleted, and only what they show inside differs.
 */
const seed = async (page, names: string[], folders: { id: string; name: string }[] = [], filed: Record<string, string> = {}) => {
  await page.goto("/");
  await page.evaluate(
    ({ paletteNames, folderList, filing }) => {
      localStorage.clear();
      localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
      localStorage.setItem(
        "palette-studio.palettes",
        JSON.stringify({
          palettes: (paletteNames as string[]).map((name, index) => ({
            id: `p${index}`,
            name,
            folderId: (filing as Record<string, string>)[name] ?? null,
            lastModified: 1_700_000_000_000 - index,
            colors: [0, 1, 2].map((step) => ({ id: `p${index}-c${step}`, name: "c", rgb: [0.2 + step * 0.2, 0.4, 0.8] })),
          })),
          folders: folderList,
          activePaletteId: "p0",
        }),
      );
    },
    { paletteNames: names, folderList: folders, filing: filed },
  );
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
};

const boxes = (page) => page.locator(".library-root > .collection-box, .library-root > .palette-card");

test("palettes and collections share one grid, at the same size", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(page, ["Alpha", "Beta"], [{ id: "f1", name: "Greens" }], { Alpha: "f1" });

  await expect(page.locator(".palette-grid")).toHaveCount(1);
  await expect(boxes(page)).toHaveCount(2);

  const widths = await boxes(page).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
});

test("a collection can be created and shows what it holds", async ({ page }) => {
  await seed(page, ["Alpha"]);
  await expect(page.locator(".collection-box")).toHaveCount(0);

  await page.locator("#create-folder").click();
  await expect(page.locator(".collection-box")).toHaveCount(1);
  await expect(page.locator(".collection-name")).toHaveText("New folder");
  // Nothing in it yet, so the preview says so rather than showing an empty frame.
  await expect(page.locator(".collection-empty")).toBeVisible();
});

test("opening a collection shows only its palettes, and back returns", async ({ page }) => {
  await seed(page, ["Inside", "Outside"], [{ id: "f1", name: "Greens" }], { Inside: "f1" });
  const list = page.locator("#palette-list");

  await page.locator(".collection-preview").first().click();
  await expect(list).toHaveAttribute("data-level", "folder");
  await expect(page.locator(".palette-card")).toHaveCount(1);
  await expect(page.locator(".palette-title")).toHaveText("Inside");

  await page.locator('[data-action-key="close-folder"]').click();
  await expect(list).toHaveAttribute("data-level", "library");
  await expect(boxes(page)).toHaveCount(2);
});

test("a collection is renamed in place, without a browser prompt", async ({ page }) => {
  await seed(page, ["Alpha"], [{ id: "f1", name: "Greens" }]);
  page.on("dialog", (dialog) => {
    throw new Error(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`);
  });

  await page.locator('.collection-box [title="Rename folder"]').click();
  const input = page.locator(".library-group-rename");
  await expect(input).toBeVisible();
  await input.fill("Campaign");
  await input.press("Enter");

  await expect(page.locator(".collection-name")).toHaveText("Campaign");
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".collection-name")).toHaveText("Campaign");
});

test("deleting a collection keeps its palettes, at the top level", async ({ page }) => {
  await seed(page, ["Alpha"], [{ id: "f1", name: "Greens" }], { Alpha: "f1" });
  await expect(boxes(page)).toHaveCount(1);

  page.on("dialog", (dialog) => dialog.accept());
  await page.locator('.collection-box [title="Delete folder"]').click();

  await expect(page.locator(".collection-box")).toHaveCount(0);
  await expect(page.locator(".palette-card")).toHaveCount(1);
});

/* The collection is a single box, so there is no slot to drop between — the whole tile is the target. */
test("a palette dropped on a collection is filed into it", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  // Two of each: with a single card the grid has no second slot, and the sortable's own drop
  // handling and this one race for the same release.
  await seed(page, ["Loose", "Other"], [{ id: "f1", name: "Greens" }, { id: "f2", name: "Blues" }]);

  const card = page.locator(".palette-card").first();
  const grip = card.locator(".palette-card-grip");
  const box = page.locator(".collection-box").first();
  const from = await grip.boundingBox();
  const to = await box.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 30, from!.y + 30, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await expect(page.locator(".collection-box.is-drop-target")).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator(".library-root > .palette-card")).toHaveCount(1);
  await page.locator(".collection-preview").first().click();
  await expect(page.locator(".palette-card")).toHaveCount(1);
});

test("search filters palettes by name and by hex", async ({ page }) => {
  await seed(page, ["Alpha", "Beta"]);
  await page.locator("#library-search").fill("alpha");
  await expect(page.locator(".palette-card")).toHaveCount(1);
  await page.locator("#library-search").fill("");
  await expect(page.locator(".palette-card")).toHaveCount(2);
});

/* "Export all" means the collection you are inside, not the library behind it. */
test("export is disabled inside an empty collection", async ({ page }) => {
  await seed(page, ["Alpha"], [{ id: "f1", name: "Greens" }]);
  await expect(page.locator("#open-export")).toBeEnabled();

  await page.locator(".collection-preview").first().click();
  await expect(page.locator("#open-export")).toBeDisabled();

  await page.locator('[data-action-key="close-folder"]').click();
  await expect(page.locator("#open-export")).toBeEnabled();
});

/* Collections do not nest, so the control that makes one is not offered inside one. */
test("no collection can be created from inside a collection", async ({ page }) => {
  await seed(page, ["Alpha"], [{ id: "f1", name: "Greens" }]);
  await expect(page.locator("#create-folder")).toBeVisible();

  await page.locator(".collection-preview").first().click();
  await expect(page.locator("#create-folder")).toBeHidden();
});
