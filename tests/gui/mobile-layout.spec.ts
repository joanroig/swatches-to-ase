import playwright from "@playwright/test";

const { expect, test } = playwright;

const seedPalette = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: [
          {
            id: "mobile-palette",
            name: "Wild Moments",
            lastModified: 1_700_000_000_000,
            colors: ["054000", "00858a", "00b3a8", "ffd6e4", "ffe3e8", "ff763f", "ffab25", "ffcf91", "061500"].map(
              (hex, index) => ({
                id: `mobile-color-${index}`,
                name: "Color",
                rgb: [
                  Number.parseInt(hex.slice(0, 2), 16) / 255,
                  Number.parseInt(hex.slice(2, 4), 16) / 255,
                  Number.parseInt(hex.slice(4, 6), 16) / 255,
                ],
              }),
            ),
          },
        ],
        activePaletteId: "mobile-palette",
      }),
    );
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
};

test("mobile header avatar fits and centers inside its button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  const geometry = await page.locator(".topbar .avatar-button").evaluate((button) => {
    const avatar = button.querySelector<HTMLImageElement>(".user-avatar")!;
    const buttonRect = button.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    const style = getComputedStyle(button);
    const horizontalInset = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft);
    const verticalInset = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.paddingTop);
    return {
      centerX: avatarRect.left + avatarRect.width / 2 - (buttonRect.left + buttonRect.width / 2),
      centerY: avatarRect.top + avatarRect.height / 2 - (buttonRect.top + buttonRect.height / 2),
      expectedWidth: buttonRect.width - horizontalInset * 2,
      expectedHeight: buttonRect.height - verticalInset * 2,
      avatarWidth: avatarRect.width,
      avatarHeight: avatarRect.height,
    };
  });

  expect(Math.abs(geometry.centerX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(geometry.centerY)).toBeLessThanOrEqual(0.5);
  expect(geometry.avatarWidth).toBeCloseTo(geometry.expectedWidth, 1);
  expect(geometry.avatarHeight).toBeCloseTo(geometry.expectedHeight, 1);
});

test("mobile view tabs do not create transient page overflow or move the navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  const measure = () =>
    page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(".bottom-nav")!.getBoundingClientRect();
      const activePanel = document.querySelector<HTMLElement>(".view-section.is-active")!;
      return {
        left: nav.left,
        top: nav.top,
        width: nav.width,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        panelTransform: getComputedStyle(activePanel).transform,
      };
    });

  const baseline = await measure();
  for (const target of ["playground", "library", "playground", "library"]) {
    await page.locator(`.bottom-nav [data-view-target="${target}"]`).click();
    const current = await measure();
    expect(current.left).toBeCloseTo(baseline.left, 1);
    expect(current.top).toBeCloseTo(baseline.top, 1);
    expect(current.width).toBeCloseTo(baseline.width, 1);
    expect(current.scrollWidth).toBeLessThanOrEqual(current.clientWidth);
    expect(current.panelTransform).toBe("none");
  }
});

test("mobile palette actions use one control shadow without a menu haze", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  await page.locator("#fab-toggle").click();

  const shadows = await page.locator("#fab-hub").evaluate((hub) => {
    const selectors = ["#fab-toggle", '[data-fab-action="import"]', '[data-fab-action="generate"]'];
    return {
      controls: selectors.map((selector) => getComputedStyle(hub.querySelector<HTMLElement>(selector)!).boxShadow),
      backdropContent: getComputedStyle(hub, "::before").content,
    };
  });

  expect(new Set(shadows.controls).size).toBe(1);
  expect(shadows.controls[0]).not.toBe("none");
  expect(shadows.backdropContent).toBe("none");
});

test("opening the palette editor does not focus the title field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  await page.locator(".palette-card").getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#editor-modal")).toHaveAttribute("aria-hidden", "false");

  await expect(page.locator("#palette-name")).not.toBeFocused();
  await expect(page.locator("#editor-modal [data-autofocus]")).toBeFocused();
});

test("editor actions stay on one row and overflow by available width", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await seedPalette(page);
  await page.locator(".palette-card").getByRole("button", { name: "Edit" }).click();

  await expect(page.locator("#open-view")).toBeVisible();
  await expect(page.locator("#editor-export")).toBeVisible();
  await expect(page.locator("#editor-tools-trigger")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#editor-tools-trigger")).toBeVisible();
  await expect(page.locator("#add-color")).toBeVisible();
  await expect(page.locator("#editor-save")).toBeVisible();
  await expect(page.locator("#editor-tools-panel #open-view")).toHaveCount(1);

  const toolbar = await page.locator(".editor-toolbar").evaluate((element) => {
    const undo = element.querySelector<HTMLElement>("#editor-undo")!.getBoundingClientRect();
    const save = element.querySelector<HTMLElement>("#editor-save")!.getBoundingClientRect();
    return {
      topDifference: Math.abs(undo.top - save.top),
      overflow: element.scrollWidth - element.clientWidth,
    };
  });
  expect(toolbar.topDifference).toBeLessThanOrEqual(1);
  expect(toolbar.overflow).toBeLessThanOrEqual(1);
});
