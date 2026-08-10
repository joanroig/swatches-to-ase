import playwright from "@playwright/test";

const { expect, test } = playwright;

/*
 * The library is one grid of equally sized boxes. A box is a palette or a collection; both can be
 * opened, named, moved and deleted, and only what they show inside differs.
 */
const seed = async (
  page,
  names: string[],
  folders: { id: string; name: string }[] = [],
  filed: Record<string, string> = {},
  libraryOrder?: string[],
) => {
  await page.goto("/");
  await page.evaluate(
    ({ paletteNames, folderList, filing, rootOrder }) => {
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
          libraryOrder: rootOrder,
          activePaletteId: "p0",
        }),
      );
    },
    { paletteNames: names, folderList: folders, filing: filed, rootOrder: libraryOrder },
  );
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
};

const boxes = (page) => page.locator(".library-root > .collection-box, .library-root > .palette-card");

const rootOrder = (page) =>
  boxes(page).evaluateAll((items: Element[]) =>
    items.map((item) => {
      const element = item as HTMLElement;
      return element.dataset.paletteId ? `palette:${element.dataset.paletteId}` : `folder:${element.dataset.folderId}`;
    }),
  );

test("palettes and collections share one grid, at the same size", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(page, ["Alpha", "Beta"], [{ id: "f1", name: "Greens" }], { Alpha: "f1" });

  await expect(page.locator(".palette-grid")).toHaveCount(1);
  await expect(boxes(page)).toHaveCount(2);

  const widths = await boxes(page).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
});

test("palettes keep their root card size inside folders regardless of folder count", async ({ page }) => {
  for (const viewportWidth of [1200, 700]) {
    await page.setViewportSize({ width: viewportWidth, height: 850 });
    await seed(
      page,
      ["Outside", "Only", "Many one", "Many two", "Many three"],
      [
        { id: "f1", name: "One palette" },
        { id: "f2", name: "Three palettes" },
      ],
      { Only: "f1", "Many one": "f2", "Many two": "f2", "Many three": "f2" },
    );

    const rootSize = await page.locator('.library-root > [data-palette-id="p0"]').evaluate((card) => {
      const rect = card.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    });

    const folderSizes: { width: number; height: number }[] = [];
    for (const folderId of ["f1", "f2"]) {
      await page.locator(`[data-folder-id="${folderId}"] .collection-preview`).click();
      folderSizes.push(
        ...(await page.locator(".library-group--open .palette-card").evaluateAll((cards) =>
          cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return { width: Math.round(rect.width), height: Math.round(rect.height) };
          }),
        )),
      );
      await page.locator('[data-action-key="close-folder"]').click();
    }

    expect(new Set(folderSizes.map(({ width }) => width))).toEqual(new Set([rootSize.width]));
    expect(new Set(folderSizes.map(({ height }) => height))).toEqual(new Set([rootSize.height]));
  }
});

test("the root drop surface reaches the same sides and bottom as a folder", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(page, ["Outside", "Inside"], [{ id: "f1", name: "Folder" }], { Inside: "f1" });
  await page.waitForTimeout(300);

  const rootBounds = await page.locator(".library-root").boundingBox();
  const dockBounds = await page.locator(".action-dock").boundingBox();
  await page.locator('[data-folder-id="f1"] .collection-preview').click();
  await page.waitForTimeout(250);
  const folderBounds = await page.locator(".library-group--open .palette-grid").boundingBox();

  expect(Math.abs(rootBounds!.x - folderBounds!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(rootBounds!.width - folderBounds!.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(rootBounds!.y + rootBounds!.height - (folderBounds!.y + folderBounds!.height))).toBeLessThanOrEqual(2);
  expect(dockBounds!.y - (rootBounds!.y + rootBounds!.height)).toBeLessThanOrEqual(12);
});

test("the root grid preserves a mixed palette-folder-palette order", async ({ page }) => {
  await seed(
    page,
    ["First", "Last"],
    [{ id: "f1", name: "Middle" }],
    {},
    ["palette:p0", "folder:f1", "palette:p1"],
  );

  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "folder:f1", "palette:p1"]);
  await page.reload();
  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "folder:f1", "palette:p1"]);
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

test("a folder centre files a palette without displacing the folder", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(
    page,
    ["First", "To file"],
    [{ id: "f1", name: "Middle" }],
    {},
    ["palette:p0", "folder:f1", "palette:p1"],
  );
  const grip = page.locator('[data-palette-id="p1"] .palette-card-grip');
  const folder = page.locator('[data-folder-id="f1"].collection-box');
  const from = await grip.boundingBox();
  const target = await folder.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x - 20, from!.y, { steps: 3 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 });

  await expect(folder).toHaveClass(/is-drop-target/);
  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "folder:f1", "palette:p1"]);
  await page.mouse.up();
  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "folder:f1"]);
});

test("a folder edge inserts the palette beside it and persists the mixed order", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(
    page,
    ["First", "Move me"],
    [{ id: "f1", name: "Middle" }],
    {},
    ["palette:p0", "folder:f1", "palette:p1"],
  );
  const grip = page.locator('[data-palette-id="p1"] .palette-card-grip');
  const folder = page.locator('[data-folder-id="f1"].collection-box');
  const from = await grip.boundingBox();
  const target = await folder.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x - 20, from!.y, { steps: 3 });
  await page.mouse.move(target!.x + 3, target!.y + target!.height / 2, { steps: 12 });

  await expect(folder).toHaveAttribute("data-insert-edge", "left");
  await page.waitForTimeout(550);
  await expect(page.locator(".library-root")).toHaveClass(/is-sorting/);
  expect(
    await page.locator(".library-root").evaluate((grid) => getComputedStyle(grid, "::before").content !== "none"),
  ).toBe(true);
  await page.mouse.up();

  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "palette:p1", "folder:f1"]);
  await page.reload();
  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "palette:p1", "folder:f1"]);
});

test("a quick folder-edge drop inserts before the spring reorder delay", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(
    page,
    ["First", "Move me"],
    [{ id: "f1", name: "Middle" }],
    {},
    ["palette:p0", "folder:f1", "palette:p1"],
  );
  const grip = page.locator('[data-palette-id="p1"] .palette-card-grip');
  const folder = page.locator('[data-folder-id="f1"].collection-box');
  const from = await grip.boundingBox();
  const target = await folder.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x - 20, from!.y, { steps: 3 });
  await page.mouse.move(target!.x + 3, target!.y + target!.height / 2, { steps: 12 });
  await expect(folder).toHaveAttribute("data-insert-edge", "left");
  await page.mouse.up();

  await expect.poll(() => rootOrder(page)).toEqual(["palette:p0", "palette:p1", "folder:f1"]);
});

test("the gap between adjacent folders is one insertion seam", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(
    page,
    ["Move me"],
    [
      { id: "f1", name: "First folder" },
      { id: "f2", name: "Second folder" },
    ],
    {},
    ["folder:f1", "folder:f2", "palette:p0"],
  );
  const firstFolder = page.locator('[data-folder-id="f1"].collection-box');
  const secondFolder = page.locator('[data-folder-id="f2"].collection-box');
  const grip = page.locator('[data-palette-id="p0"] .palette-card-grip');
  const first = await firstFolder.boundingBox();
  const second = await secondFolder.boundingBox();
  const from = await grip.boundingBox();
  const originalBorder = await secondFolder.evaluate((folder) => getComputedStyle(folder).borderColor);

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x - 20, from!.y, { steps: 3 });
  await page.mouse.move((first!.x + first!.width + second!.x) / 2, first!.y + first!.height / 2, { steps: 12 });

  await expect(page.locator(".collection-box.is-insert-target")).toHaveCount(1);
  await expect(secondFolder).toHaveAttribute("data-insert-edge", "left");
  expect(await secondFolder.evaluate((folder) => getComputedStyle(folder).borderColor)).toBe(originalBorder);
  await page.mouse.up();

  await expect.poll(() => rootOrder(page)).toEqual(["folder:f1", "palette:p0", "folder:f2"]);
});

test("a single-column folder uses only top and bottom insertion seams", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 850 });
  await seed(page, ["Move me"], [{ id: "f1", name: "Folder" }], {}, ["folder:f1", "palette:p0"]);
  const folder = page.locator('[data-folder-id="f1"].collection-box');
  const grip = page.locator('[data-palette-id="p0"] .palette-card-grip');
  const target = await folder.boundingBox();
  const from = await grip.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x, from!.y - 20, { steps: 3 });
  await page.mouse.move(target!.x + 3, target!.y + target!.height / 2, { steps: 10 });

  await expect(folder).toHaveClass(/is-drop-target/);
  await expect(page.locator(".collection-box.is-insert-target")).toHaveCount(0);
  const progressInset = await folder.evaluate((element) => {
    const progress = getComputedStyle(element, "::after");
    return {
      left: Number.parseFloat(progress.left),
      right: Number.parseFloat(progress.right),
      bottom: Number.parseFloat(progress.bottom),
      radius: Number.parseFloat(progress.borderRadius),
    };
  });
  expect(progressInset.left).toBeGreaterThanOrEqual(0);
  expect(progressInset.right).toBeGreaterThanOrEqual(0);
  expect(progressInset.bottom).toBeGreaterThanOrEqual(0);
  expect(progressInset.radius).toBeGreaterThan(0);

  await page.mouse.move(target!.x + target!.width / 2, target!.y + 3, { steps: 8 });
  await expect(folder).toHaveAttribute("data-insert-edge", "top");
  await expect(folder).not.toHaveAttribute("data-insert-edge", /left|right/);
  await page.mouse.up();
});

test("holding over a folder opens it without ending the palette drag", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(
    page,
    ["Loose", "Inside"],
    [{ id: "f1", name: "Greens" }],
    { Inside: "f1" },
    ["palette:p0", "folder:f1"],
  );
  const grip = page.locator('[data-palette-id="p0"] .palette-card-grip');
  const folder = page.locator('[data-folder-id="f1"].collection-box');
  const from = await grip.boundingBox();
  const target = await folder.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 15, from!.y + 15, { steps: 3 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 });
  await page.waitForTimeout(750);

  await expect(page.locator("#palette-list")).toHaveAttribute("data-level", "folder");
  await expect(page.locator(".palette-card.is-sort-dragging")).toHaveCount(1);
  const existing = await page.locator(".palette-card:not(.is-sort-dragging) .palette-card-grip").boundingBox();
  await page.mouse.move(existing!.x + existing!.width / 2, existing!.y + existing!.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.locator(".palette-card .palette-title").allInnerTexts()).toEqual(["Loose", "Inside"]);
});

test("holding the lit folder header goes home while preserving the drag", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(page, ["Inside", "Other"], [{ id: "f1", name: "Greens" }], { Inside: "f1", Other: "f1" });
  await page.locator(".collection-preview").click();

  const grip = page.locator('[data-palette-id="p0"] .palette-card-grip');
  const from = await grip.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 15, from!.y + 15, { steps: 3 });

  const gridBounds = await page.locator(".library-group--open .palette-grid").boundingBox();
  const headerBounds = await page.locator(".library-crumb").boundingBox();
  const dockBounds = await page.locator(".action-dock").boundingBox();
  expect(Math.abs(gridBounds!.x - headerBounds!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(gridBounds!.x + gridBounds!.width - (headerBounds!.x + headerBounds!.width))).toBeLessThanOrEqual(2);
  expect(dockBounds!.y - (gridBounds!.y + gridBounds!.height)).toBeLessThanOrEqual(12);
  await expect(page.locator(".library-crumb-drag-hint")).toBeVisible();

  await page.mouse.move(headerBounds!.x + headerBounds!.width / 2, headerBounds!.y + headerBounds!.height / 2, { steps: 8 });
  await expect(page.locator(".library-crumb")).toHaveClass(/is-drop-target/);
  await page.waitForTimeout(750);

  await expect(page.locator("#palette-list")).toHaveAttribute("data-level", "library");
  await expect(page.locator(".palette-card.is-sort-dragging")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.library-root > [data-palette-id="p0"]')).toBeVisible();
});

test("filing a palette animates the boxes that fill its old slot", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await seed(page, ["Loose", "Other"], [{ id: "f1", name: "Greens" }, { id: "f2", name: "Blues" }]);
  await page.evaluate(() => {
    document.body.dataset.motion = "on";
    const originalOther = Array.from(document.querySelectorAll<HTMLElement>(".library-root > .palette-card")).find(
      (card) => card.querySelector(".palette-title")?.textContent === "Other",
    );
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (
        this !== originalOther &&
        this.matches(".library-root > .palette-card") &&
        this.querySelector(".palette-title")?.textContent === "Other"
      ) {
        document.documentElement.dataset.libraryBoxAnimated = "true";
      }
      return animate.call(this, keyframes, options);
    };
  });

  const grip = page.locator(".palette-card").first().locator(".palette-card-grip");
  const folder = page.locator(".collection-box").first();
  const from = await grip.boundingBox();
  const to = await folder.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 30, from!.y + 30, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator(".library-root > .palette-card")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-library-box-animated", "true");
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
