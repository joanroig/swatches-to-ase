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
            colors: ["054000", "00858a", "00b3a8", "ffd6e4", "ffe3e8", "ff763f", "ffab25", "ffcf91", "061500"].map((hex, index) => ({
              id: `mobile-color-${index}`,
              name: "Color",
              rgb: [
                Number.parseInt(hex.slice(0, 2), 16) / 255,
                Number.parseInt(hex.slice(2, 4), 16) / 255,
                Number.parseInt(hex.slice(4, 6), 16) / 255,
              ],
            })),
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
    const topbar = button.closest<HTMLElement>(".topbar")!;
    const shell = document.querySelector<HTMLElement>(".shell")!;
    const buttonRect = button.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    const topbarRect = topbar.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
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
      topbarTop: topbarRect.top,
      topbarHeight: topbarRect.height,
      shellGap: shellRect.top - topbarRect.bottom,
    };
  });

  expect(Math.abs(geometry.centerX)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(geometry.centerY)).toBeLessThanOrEqual(0.5);
  expect(geometry.avatarWidth).toBeCloseTo(geometry.expectedWidth, 1);
  expect(geometry.avatarHeight).toBeCloseTo(geometry.expectedHeight, 1);
  expect(geometry.topbarTop).toBeLessThanOrEqual(8);
  expect(geometry.topbarHeight).toBeLessThanOrEqual(46);
  expect(geometry.shellGap).toBeCloseTo(8, 0);
});

test("creator profile close button stays inside its compact header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  await page.locator("#discover-profile-modal").evaluate((modal) => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  });

  const geometry = await page.locator("#discover-profile-modal .modal-card").evaluate((card) => {
    const header = card.querySelector<HTMLElement>(".modal-header")!.getBoundingClientRect();
    const close = card.querySelector<HTMLElement>(".close-button")!.getBoundingClientRect();
    const body = card.querySelector<HTMLElement>(".modal-body")!.getBoundingClientRect();
    return {
      closeOverflow: close.bottom - header.bottom,
      contentGap: body.top - close.bottom,
    };
  });

  expect(geometry.closeOverflow).toBeLessThanOrEqual(1);
  expect(geometry.contentGap).toBeGreaterThanOrEqual(7.5);
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

  await expect(page.locator("#create-folder")).toHaveAttribute("aria-label", "New folder");
  await expect(page.locator("#fab-menu")).toHaveAttribute("inert", "");
  await page.locator("#fab-toggle").click();
  await expect(page.locator("#fab-menu")).not.toHaveAttribute("inert", "");

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

test("mobile palette actions stay large and opaque", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  const toggle = page.locator("#fab-toggle");
  const toggleBox = (await toggle.boundingBox())!;
  expect(toggleBox.width).toBe(56);
  expect(toggleBox.height).toBe(56);

  await toggle.click();
  const importAction = page.locator('[data-fab-action="import"]');
  await importAction.hover();

  const alpha = await importAction.evaluate((button) => {
    const color = getComputedStyle(button).backgroundColor;
    if (color === "transparent") return 0;
    const explicitAlpha = color.match(/\/\s*([\d.]+)\)/)?.[1] ?? color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1];
    return explicitAlpha ? Number(explicitAlpha) : 1;
  });
  expect(alpha).toBe(1);

  const newButtonShape = await page.locator('[data-fab-action="generate"]').evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      borderWidth: Number.parseFloat(style.borderWidth),
      borderRadius: Number.parseFloat(style.borderRadius),
      height: button.getBoundingClientRect().height,
    };
  });
  expect(newButtonShape.borderWidth).toBe(0);
  expect(newButtonShape.borderRadius).toBeGreaterThanOrEqual(newButtonShape.height / 2);
});

test("the mobile navigation bar is opaque over page content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seedPalette(page);

  const navigation = page.locator(".bottom-nav");
  const styles = await navigation.evaluate((bar) => {
    const style = getComputedStyle(bar);
    const color = style.backgroundColor;
    const explicitAlpha = color.match(/\/\s*([\d.]+)\)/)?.[1] ?? color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1];
    return {
      alpha: color === "transparent" ? 0 : explicitAlpha ? Number(explicitAlpha) : 1,
      backdropFilter: style.backdropFilter,
    };
  });

  expect(styles.alpha).toBe(1);
  expect(styles.backdropFilter).toBe("none");
});

test("the mobile wordmark bar is opaque over scrolled content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seedPalette(page);

  await page.evaluate(() => window.scrollTo(0, 240));
  await expect(page.locator(".topbar")).toHaveClass(/is-scrolled/);

  const alpha = await page.locator(".topbar").evaluate((topbar) => {
    const color = getComputedStyle(topbar, "::before").backgroundColor;
    if (color === "transparent") return 0;
    const explicitAlpha = color.match(/\/\s*([\d.]+)\)/)?.[1] ?? color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1];
    return explicitAlpha ? Number(explicitAlpha) : 1;
  });
  expect(alpha).toBe(1);
});

test("mobile add button follows the viewport until the palette panel ends", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await seedPalette(page);
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("palette-studio.palettes") ?? "{}") as {
      palettes?: Array<Record<string, unknown>>;
    };
    const source = stored.palettes?.[0];
    if (!source) {
      return;
    }
    stored.palettes = Array.from({ length: 10 }, (_, index) => ({
      ...source,
      id: `mobile-palette-${index}`,
      name: `Mobile palette ${index + 1}`,
    }));
    localStorage.setItem("palette-studio.palettes", JSON.stringify(stored));
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const measure = () =>
    page.evaluate(() => {
      const fab = document.querySelector<HTMLElement>("#fab-hub")!.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>(".panel-palettes")!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>(".bottom-nav")!.getBoundingClientRect();
      return { fabTop: fab.top, fabBottom: fab.bottom, panelBottom: panel.bottom, navTop: nav.top };
    });

  const atTop = await measure();
  expect(atTop.fabBottom).toBeLessThan(atTop.navTop);
  expect(atTop.navTop - atTop.fabBottom).toBeGreaterThanOrEqual(6);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  const midway = await measure();
  expect(midway.fabBottom).toBeCloseTo(atTop.fabBottom, 0);
  expect(midway.fabTop).toBeCloseTo(atTop.fabTop, 0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const atEnd = await measure();
  expect(atEnd.fabBottom).toBeLessThanOrEqual(atEnd.panelBottom + 1);
  expect(atEnd.fabBottom).toBeLessThan(atEnd.navTop - 12);
});

test("opening the palette editor does not focus the title field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  await page.locator(".palette-card").getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#editor-modal")).toHaveAttribute("aria-hidden", "false");

  await expect(page.locator("#palette-name")).not.toBeFocused();
  await expect(page.locator("#editor-modal [data-autofocus]")).toBeFocused();
});

/*
 * The editor's close button sits in the flow beside the color count rather than pinned to the
 * corner, and it once kept the `translateY(-50%)` that belonged to the pinned version — which lifted
 * it 19px, half its height, above the title it belongs beside.
 */
test("the editor close button sits level with its header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPalette(page);

  await page.locator(".palette-card").getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#editor-modal")).toHaveAttribute("aria-hidden", "false");

  const offsets = await page.locator("#editor-modal .editor-header").evaluate((header) => {
    const close = header.querySelector<HTMLElement>("[data-close]")!;
    const headerBox = header.getBoundingClientRect();
    const closeBox = close.getBoundingClientRect();
    return {
      centerGap: Math.abs((closeBox.top + closeBox.bottom) / 2 - (headerBox.top + headerBox.bottom) / 2),
      aboveHeader: headerBox.top - closeBox.top,
    };
  });

  expect(offsets.centerGap).toBeLessThanOrEqual(1);
  expect(offsets.aboveHeader).toBeLessThanOrEqual(1);
});

test("editor actions stay on one row and overflow by available width", async ({ page }) => {
  await page.setViewportSize({ width: 824, height: 900 });
  await seedPalette(page);
  await page.locator(".palette-card").getByRole("button", { name: "Edit" }).click();

  await expect(page.locator("#open-view")).toBeVisible();
  await expect(page.locator("#editor-export")).toBeVisible();
  await expect(page.locator("#editor-tools-trigger")).toBeHidden();

  await page.setViewportSize({ width: 613, height: 844 });
  await expect(page.locator("#editor-tools-trigger")).toBeVisible();
  await expect(page.locator("#add-color")).toBeVisible();
  await expect(page.locator("#editor-export")).toBeVisible();
  await expect(page.locator("#open-view")).toBeVisible();
  const addColorGeometry = await page.locator("#add-color").evaluate((button) => ({
    height: button.getBoundingClientRect().height,
    exportHeight: document.querySelector<HTMLElement>("#editor-export")!.getBoundingClientRect().height,
    whiteSpace: getComputedStyle(button).whiteSpace,
    scrollWidth: button.scrollWidth,
    clientWidth: button.clientWidth,
  }));
  expect(addColorGeometry.height).toBeCloseTo(addColorGeometry.exportHeight, 1);
  expect(addColorGeometry.whiteSpace).toBe("nowrap");
  expect(addColorGeometry.scrollWidth).toBeLessThanOrEqual(addColorGeometry.clientWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#editor-tools-trigger")).toBeVisible();
  await expect(page.locator("#add-color")).toBeVisible();
  await expect(page.locator("#add-color")).toHaveAttribute("aria-label", "Add color");
  await expect(page.locator("#add-color > span")).toBeHidden();
  await expect(page.locator("#editor-save")).toBeVisible();
  await expect(page.locator("#editor-tools-panel #open-view")).toHaveCount(1);
  await expect(page.locator("#editor-tools-primary > *")).not.toHaveCount(0);
  await expect(page.locator("#editor-tools-panel > *")).not.toHaveCount(0);
  await page.locator("#editor-tools-trigger").click();
  await expect(page.locator("#editor-tools-panel #open-view")).toBeVisible();
  await page.locator("#editor-tools-trigger").click();
  await expect(page.locator("#editor-tools-trigger")).toHaveAttribute("aria-expanded", "false");

  const measureToolbar = () =>
    page.locator(".editor-toolbar").evaluate((element) => {
      const undo = element.querySelector<HTMLElement>("#editor-undo")!.getBoundingClientRect();
      const save = element.querySelector<HTMLElement>("#editor-save")!.getBoundingClientRect();
      const history = element.querySelector<HTMLElement>(".editor-toolbar-group:first-child")!.getBoundingClientRect();
      const tools = element.querySelector<HTMLElement>("#editor-tools")!.getBoundingClientRect();
      const visibleToolLeft = ["#editor-tools-primary > button", "#editor-tools-trigger", "#editor-save"]
        .flatMap((selector) => Array.from(element.querySelectorAll<HTMLElement>(selector)))
        .map((control) => control.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .reduce((left, rect) => Math.min(left, rect.left), Number.POSITIVE_INFINITY);
      return {
        topDifference: Math.abs(undo.top - save.top),
        overflow: element.scrollWidth - element.clientWidth,
        groupGap: tools.left - history.right,
        controlGap: visibleToolLeft - history.right,
      };
    });

  const toolbar = await measureToolbar();
  expect(toolbar.topDifference).toBeLessThanOrEqual(1);
  expect(toolbar.overflow).toBeLessThanOrEqual(1);
  expect(toolbar.groupGap).toBeGreaterThanOrEqual(0);
  expect(toolbar.controlGap).toBeGreaterThanOrEqual(0);

  // Android's font scaling can enlarge labels without changing the CSS viewport width.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(page.locator("#add-color")).toBeVisible();
  await expect.poll(async () => (await measureToolbar()).controlGap).toBeGreaterThanOrEqual(0);

  await page.setViewportSize({ width: 824, height: 844 });
  await expect(page.locator("#editor-tools-trigger")).toBeHidden();
  await expect(page.locator("#editor-tools-primary > *")).toHaveCount(5);
  await expect(page.locator("#editor-tools-panel > *")).toHaveCount(0);
});
