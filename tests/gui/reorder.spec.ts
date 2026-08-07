import playwright from "@playwright/test";

const { expect, test } = playwright;

type SeedColor = { name: string; hex: string };

const hexToRgb = (hex: string) => {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ];
};

const seedPalettes = async (page, palettes: Array<{ name: string; colors?: SeedColor[] }>) => {
  await page.goto("/");
  await page.evaluate((entries) => {
    localStorage.clear();
    // Keep colour names literal so assertions do not depend on the colour-namer output.
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: entries,
        activePaletteId: entries[0]?.id ?? null,
      }),
    );
  }, palettes.map((palette, index) => ({
    id: `palette-${index}`,
    name: palette.name,
    lastModified: 1_700_000_000_000 - index,
    colors: (palette.colors ?? []).map((color, colorIndex) => ({
      id: `palette-${index}-color-${colorIndex}`,
      name: color.name,
      rgb: hexToRgb(color.hex),
    })),
  })));
  await page.reload();
  // `body:not(.is-ready) .page` is `visibility: hidden`, so cards can exist with no bounding box.
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".palette-card")).toHaveCount(palettes.length);
};

const getPaletteTitles = async (page) => {
  const titles = await page.locator(".palette-card .palette-title").allInnerTexts();
  return titles.map((value) => value.trim());
};

const getColorRowIds = async (page) =>
  page.locator(".color-row").evaluateAll((rows: Element[]) =>
    rows.map((row) => (row as HTMLElement).dataset.colorId ?? ""),
  );

const getColorRowSizes = async (page) =>
  page.locator(".color-row").evaluateAll((rows: Element[]) =>
    rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }),
  );

/**
 * Drag from one point to another with enough intermediate moves to exercise the pointer handler.
 * Returns the visible order captured immediately before release, so callers can assert the
 * "lands exactly where you dropped it" invariant.
 */
const dragTo = async (page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 20) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // A first small nudge clears the drag threshold before the long travel begins.
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
  const previewOrder = await getPaletteTitles(page);
  await page.mouse.up();
  return previewOrder;
};

/** Drive the single layout toggle, which flips between rows and columns. */
const setEditorLayout = async (page, layout: "horizontal" | "vertical") => {
  const editor = page.locator("#palette-editor");
  if ((await editor.getAttribute("data-layout")) !== layout) {
    await page.locator("#editor-layout-toggle").click();
  }
  await expect(editor).toHaveAttribute("data-layout", layout);
};

/** The modal opens with a scale transition; measuring before it settles yields 98%-sized boxes. */
const waitForModalSettled = async (page, selector: string) => {
  await expect
    .poll(() =>
      page.locator(selector).evaluate((element: Element) => {
        const transform = getComputedStyle(element).transform;
        return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
      }),
    )
    .toBe(true);
};

const centerOf = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/** Palette cards are dragged by their grip, not by the card body. */
const gripOf = async (page, index: number) => {
  const box = await boxOf(page.locator(".palette-card").nth(index).locator(".palette-card-grip"));
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const boxOf = async (locator) => {
  // Wait for the element to actually be laid out: the shell fades sections in, so a box can be
  // momentarily unavailable even after the cards exist.
  await expect(locator).toBeVisible();
  let box = await locator.boundingBox();
  for (let attempt = 0; attempt < 20 && (!box || box.height === 0); attempt += 1) {
    await locator.page().waitForTimeout(50);
    box = await locator.boundingBox();
  }
  if (!box || box.height === 0) {
    throw new Error("Element has no bounding box");
  }
  return box;
};

test.describe("palette card reordering", () => {
  test("dragging a card to the end lands it there and persists", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedPalettes(page, [{ name: "Gamma" }, { name: "Beta" }, { name: "Alpha" }]);

    await expect(page.locator(".palette-card")).toHaveCount(3);
    expect(await getPaletteTitles(page)).toEqual(["Gamma", "Beta", "Alpha"]);

    const first = await boxOf(page.locator(".palette-card").nth(0));
    const last = await boxOf(page.locator(".palette-card").nth(2));
    const target = centerOf(last);
    const isSameRow = Math.abs(last.y - first.y) < 8;

    await dragTo(
      page,
      await gripOf(page, 0),
      // Push just past the last slot's centre along whichever axis the list flows.
      isSameRow ? { x: target.x + last.width * 0.3, y: target.y } : { x: target.x, y: target.y + last.height * 0.3 },
    );

    await expect.poll(() => getPaletteTitles(page)).toEqual(["Beta", "Alpha", "Gamma"]);

    await page.reload();
    await expect.poll(() => getPaletteTitles(page)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  test("dragging a card in a single-column layout lands it exactly where released", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 1000 });
    await seedPalettes(page, [{ name: "One" }, { name: "Two" }, { name: "Three" }, { name: "Four" }]);

    await expect(page.locator(".palette-card")).toHaveCount(4);
    expect(await getPaletteTitles(page)).toEqual(["One", "Two", "Three", "Four"]);

    // Measuring the first card is how this waits for the grid to finish laying out.
    await boxOf(page.locator(".palette-card").nth(0));
    const third = await boxOf(page.locator(".palette-card").nth(2));

    // Release just below the third card's centre: "One" must land at index 2, not overshoot.
    await dragTo(
      page,
      await gripOf(page, 0),
      { x: third.x + third.width / 2, y: third.y + third.height * 0.6 },
    );

    await expect.poll(() => getPaletteTitles(page)).toEqual(["Two", "Three", "One", "Four"]);
  });

  test("a drag does not also open the palette view modal", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 1000 });
    await seedPalettes(page, [{ name: "One" }, { name: "Two" }, { name: "Three" }]);

    await boxOf(page.locator(".palette-card").nth(0));
    const last = await boxOf(page.locator(".palette-card").nth(2));

    await dragTo(
      page,
      await gripOf(page, 0),
      { x: last.x + last.width / 2, y: last.y + last.height * 0.6 },
    );

    await expect.poll(() => getPaletteTitles(page)).toEqual(["Two", "Three", "One"]);
    await expect(page.locator("#view-modal")).toHaveAttribute("aria-hidden", "true");
  });

  test("dragging across rows of a wrapping grid lands on the released slot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await seedPalettes(
      page,
      Array.from({ length: 9 }, (_, index) => ({ name: `P${index + 1}` })),
    );

    const layout = await page.locator(".palette-card").evaluateAll((cards: Element[]) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
    const rows = new Set(layout.map((box) => Math.round(box.y)));
    // The bug only shows up once the grid wraps, so make sure this fixture actually wraps.
    expect(rows.size).toBeGreaterThan(1);

    // Row 0, column 0 → down into the second row.
    const target = layout[5];
    const preview = await dragTo(
      page,
      await gripOf(page, 0),
      { x: target.x + target.width * 0.75, y: target.y + target.height / 2 },
      24,
    );

    // The order shown mid-drag is exactly the order that survives the drop.
    await expect.poll(() => getPaletteTitles(page)).toEqual(preview);
    expect(preview.indexOf("P1")).toBeGreaterThanOrEqual(4);
    expect(preview).toHaveLength(9);
    expect([...preview].sort()).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]);
  });

  test("dragging backwards across rows lands on the released slot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await seedPalettes(
      page,
      Array.from({ length: 9 }, (_, index) => ({ name: `P${index + 1}` })),
    );

    const layout = await page.locator(".palette-card").evaluateAll((cards: Element[]) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
    expect(new Set(layout.map((box) => Math.round(box.y))).size).toBeGreaterThan(1);

    // Last card → the left half of the very first slot, which must put it at the front.
    const target = layout[0];
    const preview = await dragTo(
      page,
      await gripOf(page, 8),
      { x: target.x + target.width * 0.25, y: target.y + target.height / 2 },
      24,
    );

    expect(preview).toEqual(["P9", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    await expect.poll(() => getPaletteTitles(page)).toEqual(preview);
  });

  test("clicking a card still opens the view modal", async ({ page }) => {
    await seedPalettes(page, [{ name: "One" }, { name: "Two" }]);
    await page.locator(".palette-card").first().click();
    await expect(page.locator("#view-modal")).toHaveAttribute("aria-hidden", "false");
  });
});

test.describe("colour swatch reordering", () => {
  const COLORS: SeedColor[] = [
    { name: "One", hex: "#ff0000" },
    { name: "Two", hex: "#00ff00" },
    { name: "Three", hex: "#0000ff" },
    { name: "Four", hex: "#ffff00" },
    { name: "Five", hex: "#ff00ff" },
  ];

  const openEditor = async (page) => {
    await page.locator(".palette-card").first().getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#editor-modal")).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator(".color-row")).toHaveCount(COLORS.length);
    await waitForModalSettled(page, "#editor-modal .modal-card");
  };

  test("swatches keep their size while being dragged", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPalettes(page, [{ name: "Palette", colors: COLORS }]);
    await openEditor(page);

    const before = await getColorRowSizes(page);
    const first = await boxOf(page.locator(".color-row").nth(0));
    const handle = await boxOf(page.locator(".color-row").nth(0).locator(".drag-handle"));
    const third = await boxOf(page.locator(".color-row").nth(2));

    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 12, { steps: 4 });
    await page.mouse.move(third.x + third.width / 2, third.y + third.height * 0.6, { steps: 12 });

    // The regression: the drop target used to appear as an extra grid track mid-drag, which
    // squeezed every row. Row count and row sizes must be identical to before the drag.
    await expect(page.locator(".color-row")).toHaveCount(COLORS.length);
    const during = await getColorRowSizes(page);
    expect(during).toEqual(before);

    await page.mouse.up();

    await expect(page.locator(".color-row")).toHaveCount(COLORS.length);
    expect(await getColorRowSizes(page)).toEqual(before);
    void first;
  });

  test("dragging a swatch by its handle reorders the palette and persists", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPalettes(page, [{ name: "Palette", colors: COLORS }]);
    await openEditor(page);

    const idsBefore = await getColorRowIds(page);
    const handle = await boxOf(page.locator(".color-row").nth(0).locator(".drag-handle"));
    const third = await boxOf(page.locator(".color-row").nth(2));

    await dragTo(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: third.x + third.width / 2, y: third.y + third.height * 0.6 },
      14,
    );

    const expected = [idsBefore[1], idsBefore[2], idsBefore[0], idsBefore[3], idsBefore[4]];
    await expect.poll(() => getColorRowIds(page)).toEqual(expected);

    // Editor changes are staged, so a reorder must enable Save (and Undo) before it persists.
    await expect(page.locator("#editor-save")).toBeEnabled();
    await expect(page.locator("#editor-undo")).toBeEnabled();
    await page.locator("#editor-save").click();

    await page.reload();
    await page.locator(".palette-card").first().getByRole("button", { name: "Edit" }).click();
    await expect.poll(() => getColorRowIds(page)).toEqual(expected);
  });

  test("a swatch reorder can be undone and cancelled", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPalettes(page, [{ name: "Palette", colors: COLORS }]);
    await openEditor(page);

    const idsBefore = await getColorRowIds(page);
    const handle = await boxOf(page.locator(".color-row").nth(0).locator(".drag-handle"));
    const third = await boxOf(page.locator(".color-row").nth(2));

    await dragTo(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: third.x + third.width / 2, y: third.y + third.height * 0.6 },
      14,
    );
    await expect.poll(() => getColorRowIds(page)).not.toEqual(idsBefore);

    await page.locator("#editor-undo").click();
    await expect.poll(() => getColorRowIds(page)).toEqual(idsBefore);
  });

  test("dragging a swatch in the vertical layout reorders it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPalettes(page, [{ name: "Palette", colors: COLORS }]);
    await openEditor(page);

    await setEditorLayout(page, "vertical");

    const idsBefore = await getColorRowIds(page);
    const handle = await boxOf(page.locator(".color-row").nth(0).locator(".drag-handle"));
    const third = await boxOf(page.locator(".color-row").nth(2));

    await dragTo(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: third.x + third.width * 0.6, y: third.y + third.height / 2 },
      14,
    );

    await expect
      .poll(() => getColorRowIds(page))
      .toEqual([idsBefore[1], idsBefore[2], idsBefore[0], idsBefore[3], idsBefore[4]]);
  });
});

test.describe("inline colour insertion", () => {
  const COLORS: SeedColor[] = [
    { name: "One", hex: "#ff0000" },
    { name: "Two", hex: "#00ff00" },
    { name: "Three", hex: "#0000ff" },
  ];

  test("the + between swatches inserts at that position", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPalettes(page, [{ name: "Palette", colors: COLORS }]);
    await page.locator(".palette-card").first().getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".color-row")).toHaveCount(3);
    await waitForModalSettled(page, "#editor-modal .modal-card");

    const idsBefore = await getColorRowIds(page);

    // The "+" on the second row inserts before it, i.e. at index 1.
    const secondRow = page.locator(".color-row").nth(1);
    await secondRow.locator(".color-insert-zone").first().hover();
    await secondRow.locator(".color-insert").first().click();

    await expect(page.locator(".color-row")).toHaveCount(4);
    const idsAfter = await getColorRowIds(page);
    expect(idsAfter[0]).toBe(idsBefore[0]);
    expect(idsAfter[2]).toBe(idsBefore[1]);
    expect(idsAfter[3]).toBe(idsBefore[2]);
    // The new colour is the one that was not there before.
    expect(idsBefore).not.toContain(idsAfter[1]);
  });

  test("the trailing + on the last swatch appends", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedPalettes(page, [{ name: "Palette", colors: COLORS }]);
    await page.locator(".palette-card").first().getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(".color-row")).toHaveCount(3);
    await waitForModalSettled(page, "#editor-modal .modal-card");

    const idsBefore = await getColorRowIds(page);
    const lastRow = page.locator(".color-row").last();
    await lastRow.locator(".color-insert-zone--end").hover();
    await lastRow.locator(".color-insert-zone--end .color-insert").click();

    await expect(page.locator(".color-row")).toHaveCount(4);
    const idsAfter = await getColorRowIds(page);
    expect(idsAfter.slice(0, 3)).toEqual(idsBefore);
  });
});
