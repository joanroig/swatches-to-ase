import playwright from "@playwright/test";

const { expect, test } = playwright;

/**
 * These tests guard against the "cards flip back and forth many times while I drag" failure mode.
 * They count how many times the DOM order actually changes during one slow, monotonic drag: a
 * well-behaved sortable performs one reorder per slot crossed, never more.
 */

/** Palette cards now live inside a folder grid rather than directly under #palette-list. */
const PALETTE_GRID = ".palette-grid[data-folder-id]";

const seed = async (page, count: number) => {
  await page.goto("/");
  await page.evaluate((total) => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    const palettes = Array.from({ length: total as number }, (_unused, index) => ({
      id: `p${index}`,
      name: `P${index}`,
      lastModified: 1_700_000_000_000 - index,
      colors: [{ id: `p${index}-c0`, name: "C", rgb: [0.2, 0.4, 0.8] }],
    }));
    localStorage.setItem("palette-studio.palettes", JSON.stringify({ palettes, activePaletteId: "p0" }));
  }, count);
  await page.reload();
  // `body:not(.is-ready) .page` is `visibility: hidden`, so cards can exist with no bounding box.
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".palette-card")).toHaveCount(count);
};

/** Start recording every childList change on the list, plus the order after each change. */
const startOrderRecorder = (page, selector: string) =>
  page.evaluate((sel) => {
    const container = document.querySelector(sel as string);
    if (!container) {
      throw new Error(`No container for ${sel}`);
    }
    const readOrder = () =>
      Array.from(container.children)
        .map((child) => (child as HTMLElement).dataset.paletteId ?? (child as HTMLElement).dataset.colorId ?? "")
        .filter(Boolean)
        .join(",");
    const record: string[] = [readOrder()];
    const observer = new MutationObserver(() => {
      const next = readOrder();
      if (next !== record[record.length - 1]) {
        record.push(next);
      }
    });
    observer.observe(container, { childList: true });
    (window as unknown as { __orderRecord: string[]; __orderObserver: MutationObserver }).__orderRecord = record;
    (window as unknown as { __orderObserver: MutationObserver }).__orderObserver = observer;
  }, selector);

const stopOrderRecorder = (page) =>
  page.evaluate(() => {
    const scope = window as unknown as { __orderRecord: string[]; __orderObserver?: MutationObserver };
    scope.__orderObserver?.disconnect();
    return scope.__orderRecord;
  });

const boxOf = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Element has no bounding box");
  }
  return box;
};

/**
 * The decisive test. If the hit test is not a pure function of the pointer it forms a cycle:
 * resolving from index A yields B and resolving from B yields A, so the list flips back and forth
 * forever even though the pointer is completely still. Park the pointer at a range of positions,
 * including slot boundaries and gutters, and require the order to settle.
 */
test("holding the pointer still never keeps reshuffling the grid", async ({ page }) => {
  // A short, narrow window: a two-column grid, which is where the cycle showed up.
  await page.setViewportSize({ width: 1000, height: 660 });
  await seed(page, 6);

  const layout = await page.locator(".palette-card").evaluateAll((cards: Element[]) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  const columns = new Set(layout.map((box) => Math.round(box.x))).size;
  expect(columns).toBeGreaterThan(1);

  const source = layout[0];
  await page.mouse.move(source.x + source.width / 2, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + 30, { steps: 4 });

  // Probe centres, edges and the gutters between slots.
  const probes: Array<{ x: number; y: number; label: string }> = [];
  layout.forEach((box, index) => {
    probes.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, label: `centre of slot ${index}` });
    probes.push({ x: box.x + 2, y: box.y + 2, label: `top-left of slot ${index}` });
    probes.push({ x: box.x + box.width - 2, y: box.y + box.height - 2, label: `bottom-right of slot ${index}` });
    probes.push({ x: box.x + box.width / 2, y: box.y - 8, label: `gutter above slot ${index}` });
  });

  for (const probe of probes) {
    await page.mouse.move(probe.x, probe.y, { steps: 6 });
    // Let the loop settle, then start watching with the pointer completely stationary.
    await page.waitForTimeout(120);
    await startOrderRecorder(page, PALETTE_GRID);
    await page.waitForTimeout(350);
    const record = await stopOrderRecorder(page);
    expect(record.length, `order kept changing while parked at the ${probe.label}:\n${record.join("\n")}`).toBe(1);
  }

  await page.mouse.up();
});

test("a slow drag across a wrapping grid reorders once per slot, not repeatedly", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await seed(page, 9);

  const layout = await page.locator(".palette-card").evaluateAll((cards: Element[]) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  expect(new Set(layout.map((box) => Math.round(box.y))).size).toBeGreaterThan(1);

  await startOrderRecorder(page, PALETTE_GRID);

  const source = layout[0];
  const target = layout[7];
  await page.mouse.move(source.x + source.width / 2, source.y + 24);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + 34, { steps: 4 });

  // Crawl to the target in many tiny increments — the worst case for an unstable hit test.
  const steps = 60;
  const fromX = source.x + source.width / 2 + 10;
  const fromY = source.y + 34;
  const toX = target.x + target.width / 2;
  const toY = target.y + target.height / 2;
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    await page.mouse.move(fromX + (toX - fromX) * ratio, fromY + (toY - fromY) * ratio);
  }
  await page.mouse.up();

  const record = await stopOrderRecorder(page);
  // 9 slots: crossing every one of them is 8 changes, plus the final re-render. Anything much
  // above that means the index is thrashing.
  expect(record.length, `order changed ${record.length - 1} times:\n${record.join("\n")}`).toBeLessThanOrEqual(11);
  expect(record.length).toBeGreaterThan(1);
});

test("a slow vertical drag in a single-column list reorders monotonically", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1200 });
  await seed(page, 6);

  await startOrderRecorder(page, PALETTE_GRID);

  const first = await boxOf(page.locator(".palette-card").nth(0));
  const last = await boxOf(page.locator(".palette-card").nth(5));

  await page.mouse.move(first.x + first.width / 2, first.y + 24);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2, first.y + 34, { steps: 4 });
  const steps = 80;
  for (let step = 1; step <= steps; step += 1) {
    const y = first.y + 34 + ((last.y + last.height / 2 - (first.y + 34)) * step) / steps;
    await page.mouse.move(first.x + first.width / 2, y);
  }
  await page.mouse.up();

  const record = await stopOrderRecorder(page);
  expect(record.length, `order changed ${record.length - 1} times:\n${record.join("\n")}`).toBeLessThanOrEqual(8);

  // The dragged card must have walked strictly downwards, never bouncing back up.
  const positions = record.map((order) => order.split(",").indexOf("p0"));
  for (let index = 1; index < positions.length; index += 1) {
    expect(positions[index], `bounced backwards at step ${index}:\n${record.join("\n")}`).toBeGreaterThanOrEqual(
      positions[index - 1],
    );
  }
});

test("a slow drag of a colour row reorders once per slot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
            name: "P0",
            lastModified: 1_700_000_000_000,
            colors: Array.from({ length: 8 }, (_unused, index) => ({
              id: `c${index}`,
              name: `C${index}`,
              rgb: [index / 8, 0.4, 0.8],
            })),
          },
        ],
        activePaletteId: "p0",
      }),
    );
  });
  await page.reload();
  await page.locator(".palette-card").first().getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".color-row")).toHaveCount(8);

  await startOrderRecorder(page, ".color-list");

  const handle = await boxOf(page.locator(".color-row").nth(0).locator(".drag-handle"));
  const last = await boxOf(page.locator(".color-row").nth(7));

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 10, { steps: 4 });
  const steps = 80;
  const fromY = handle.y + handle.height / 2 + 10;
  const toY = last.y + last.height / 2;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(handle.x + handle.width / 2, fromY + ((toY - fromY) * step) / steps);
  }
  await page.mouse.up();

  const record = await stopOrderRecorder(page);
  expect(record.length, `order changed ${record.length - 1} times:\n${record.join("\n")}`).toBeLessThanOrEqual(10);

  const positions = record.map((order) => order.split(",").indexOf("c0"));
  for (let index = 1; index < positions.length; index += 1) {
    expect(positions[index], `bounced backwards at step ${index}:\n${record.join("\n")}`).toBeGreaterThanOrEqual(
      positions[index - 1],
    );
  }
});
