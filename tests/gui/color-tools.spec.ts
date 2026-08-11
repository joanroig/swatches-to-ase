import playwright from "@playwright/test";

const { expect, test } = playwright;

const SWATCHES = ["#e6c79c", "#0c0f05", "#6fd08c", "#7b9ea8", "#78586f"];

const openEditor = async (page, width = 1200, height = 900) => {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.evaluate((hexes) => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    localStorage.setItem("palette-studio.editor-layout", "horizontal");
    const toRgb = (hex: string) => [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    ];
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: [
          {
            id: "p0",
            name: "Demo",
            lastModified: 1,
            colors: (hexes as string[]).map((hex, index) => ({ id: `c${index}`, name: "c", rgb: toRgb(hex) })),
          },
        ],
        folders: [],
        activePaletteId: "p0",
      }),
    );
  }, SWATCHES);
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator(".palette-card").first().getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".color-row")).toHaveCount(SWATCHES.length);
};

const openTools = async (page, rowIndex: number) => {
  await page.locator(".color-row").nth(rowIndex).locator(".color-card-value").click();
  await expect(page.locator(".color-tools")).toBeVisible();
};

test("the hex field edits the color and records an undo step", async ({ page }) => {
  await openEditor(page);
  await openTools(page, 1);

  await page.locator(".color-hex-input").fill("#FF8800");
  await page.locator(".color-hex-input").press("Enter");

  await expect(page.locator(".color-row").nth(1).locator(".color-card-value")).toHaveText("#FF8800");
  await expect(page.locator("#editor-save")).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(page.locator(".color-tools")).toHaveCount(0);

  await page.locator("#editor-undo").click();
  await expect(page.locator(".color-row").nth(1).locator(".color-card-value")).toHaveText("#0C0F05");
});

test("an invalid hex is rejected without changing the color", async ({ page }) => {
  await openEditor(page);
  await openTools(page, 0);

  await page.locator(".color-hex-input").fill("nope");
  await page.locator(".color-hex-input").press("Enter");

  await expect(page.locator(".color-hex-input")).toHaveValue("#E6C79C");
  await expect(page.locator(".color-row").nth(0).locator(".color-card-value")).toHaveText("#E6C79C");
});

test("dragging the saturation area changes the color", async ({ page }) => {
  await openEditor(page);
  await openTools(page, 2);

  const before = await page.locator(".color-hex-input").inputValue();
  const area = (await page.locator(".picker-area").boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.2, area.y + area.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.9, area.y + area.height * 0.1, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.locator(".color-hex-input").inputValue()).not.toBe(before);
  await expect(page.locator("#editor-save")).toBeEnabled();
});

test("shades are listed and can be applied", async ({ page }) => {
  await openEditor(page);
  await openTools(page, 2);
  await page.locator(".color-tools-tab", { hasText: "Shades" }).click();

  const shades = page.locator(".color-shade");
  await expect(shades.first()).toBeVisible();
  expect(await shades.count()).toBeGreaterThan(5);
  // Exactly one entry is marked as the color the ramp was built from.
  await expect(page.locator(".color-shade.is-source")).toHaveCount(1);

  const hex = await shades.nth(3).innerText();
  await shades.nth(3).click();
  await expect(page.locator(".color-row").nth(2).locator(".color-card-value")).toHaveText(`#${hex}`);
});

test("info reports conversions and WCAG contrast", async ({ page }) => {
  await openEditor(page);
  await openTools(page, 1);
  await page.locator(".color-tools-tab", { hasText: "Info" }).click();

  const readouts = page.locator(".color-readout-label");
  await expect(readouts).toHaveText(["HEX", "RGB", "HSL", "HSB", "CMYK", "LAB"]);

  // #0c0f05 is near-black: white text passes at AAA, black text fails.
  const rows = page.locator(".color-contrast-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".color-contrast-grade")).toHaveText("AAA");
  await expect(rows.nth(1).locator(".color-contrast-grade")).toHaveText("Fail");
});

test("the popover stays inside the viewport in the column layout", async ({ page }) => {
  await openEditor(page);
  await page.locator("#editor-layout-toggle").click();
  await expect(page.locator("#palette-editor")).toHaveAttribute("data-layout", "vertical");
  await openTools(page, 1);

  const box = (await page.locator(".color-tools").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
});

test("long notations are not truncated in the column layout", async ({ page }) => {
  await openEditor(page);
  await page.locator("#editor-layout-toggle").click();
  await expect(page.locator("#palette-editor")).toHaveAttribute("data-layout", "vertical");
  await page.locator("#color-notation-editor").selectOption("hsl");

  const clipped = await page
    .locator(".color-card-value")
    .evaluateAll(
      (elements: Element[]) =>
        elements.filter((element) => (element as HTMLElement).scrollWidth > (element as HTMLElement).clientWidth + 1).length,
    );
  expect(clipped).toBe(0);
});

test("editor swatches join edge-to-edge in both layouts", async ({ page }) => {
  await openEditor(page);
  const rows = page.locator(".color-row");
  const horizontal = await rows.evaluateAll((elements) =>
    elements.slice(0, 2).map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    }),
  );
  expect(Math.abs(horizontal[0].bottom - horizontal[1].top)).toBeLessThanOrEqual(1);

  await page.locator("#editor-layout-toggle").click();
  const vertical = await rows.evaluateAll((elements) =>
    elements.slice(0, 2).map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    }),
  );
  expect(Math.abs(vertical[0].right - vertical[1].left)).toBeLessThanOrEqual(1);
});

test("change color only occupies the code and name", async ({ page }) => {
  await openEditor(page);
  const row = page.locator(".color-row").first();
  const geometry = await row.evaluate((element) => {
    const target = element.querySelector<HTMLElement>(".color-card-text")!.getBoundingClientRect();
    const actions = element.querySelector<HTMLElement>(".color-actions")!.getBoundingClientRect();
    return {
      target: { right: target.right, top: target.top, bottom: target.bottom, width: target.width },
      actions: { left: actions.left },
    };
  });

  expect(geometry.target.width).toBeLessThan(260);
  expect(geometry.target.right).toBeLessThan(geometry.actions.left);
  await page.mouse.click((geometry.target.right + geometry.actions.left) / 2, (geometry.target.top + geometry.target.bottom) / 2);
  await expect(page.locator(".color-tools")).toHaveCount(0);
  await row.locator(".color-card-name").click();
  await expect(page.locator(".color-tools")).toBeVisible();
});

test("vertical labels stay centered with code before name", async ({ page }) => {
  await openEditor(page, 390, 844);
  await page.locator("#editor-layout-toggle").evaluate((button: HTMLButtonElement) => button.click());

  const labels = await page.locator(".color-row").evaluateAll((rows) =>
    rows.map((row) => {
      const rowBox = row.getBoundingClientRect();
      const label = row.querySelector<HTMLElement>(".color-card-text")!;
      const labelBox = label.getBoundingClientRect();
      return {
        centerDelta: Math.abs(rowBox.left + rowBox.width / 2 - (labelBox.left + labelBox.width / 2)),
        flexDirection: getComputedStyle(label).flexDirection,
        parts: [...label.children].map((child) => child.className),
      };
    }),
  );

  for (const label of labels) {
    expect(label.centerDelta).toBeLessThanOrEqual(1);
    expect(label.flexDirection).toBe("row");
    expect(label.parts).toEqual(["color-card-value", "color-card-name"]);
  }
});
