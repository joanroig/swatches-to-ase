import playwright from "@playwright/test";

const { expect, test } = playwright;

const SWATCH = ".playground-swatch[data-swatch-id]";

const openPlayground = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await page.locator('[data-view-target="playground"]:visible').click();
  await expect(page.locator(".panel-playground")).toBeVisible();
  await expect(page.locator(SWATCH)).toHaveCount(5);
};

const hexes = (page) =>
  page
    .locator(`${SWATCH} .playground-swatch-hex`)
    .allInnerTexts()
    .then((values: string[]) => values.map((value) => value.trim()));

test.describe("playground", () => {
  test("the full-bleed preview is clipped to the panel's rounded bottom corners", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPlayground(page);

    const panelStyle = await page.locator(".panel-playground").evaluate((panel) => {
      const style = getComputedStyle(panel);
      return {
        overflow: style.overflow,
        bottomLeftRadius: style.borderBottomLeftRadius,
        bottomRightRadius: style.borderBottomRightRadius,
      };
    });

    expect(panelStyle.overflow).toBe("hidden");
    expect(parseFloat(panelStyle.bottomLeftRadius)).toBeGreaterThan(0);
    expect(parseFloat(panelStyle.bottomRightRadius)).toBeGreaterThan(0);
  });

  test("shuffling replaces the working colors", async ({ page }) => {
    await openPlayground(page);
    const before = await hexes(page);

    await page.locator("#playground-shuffle").click();
    const after = await hexes(page);

    expect(after).toHaveLength(before.length);
    expect(after).not.toEqual(before);
  });

  test("a locked color survives a shuffle", async ({ page }) => {
    await openPlayground(page);
    const first = page.locator(SWATCH).first();
    await first.hover();
    await first.locator(".playground-swatch-action").first().click();
    await expect(first).toHaveClass(/is-locked/);

    const locked = (await hexes(page))[0];
    for (let round = 0; round < 3; round += 1) {
      await page.locator("#playground-shuffle").click();
      expect((await hexes(page))[0]).toBe(locked);
    }
  });

  test("the + between swatches inserts a color at that seam", async ({ page }) => {
    await openPlayground(page);
    const before = await hexes(page);

    // The zone on a swatch's leading edge inserts before it, so the new color lands at index 2.
    await page.locator(`${SWATCH}`).nth(2).locator(".playground-insert").first().click({ force: true });

    const after = await hexes(page);
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after.slice(3)).toEqual(before.slice(2));
  });

  test("a swatch can be removed from its own bin button", async ({ page }) => {
    await openPlayground(page);
    const first = page.locator(SWATCH).first();
    await first.hover();
    await first.locator(".playground-swatch-action").last().click();
    await expect(page.locator(SWATCH)).toHaveCount(4);
  });

  test("a locked swatch shows only its padlock", async ({ page }) => {
    await openPlayground(page);
    const swatch = page.locator(SWATCH).first();
    await swatch.hover();
    await swatch.locator(".playground-swatch-action").first().click();
    await expect(swatch).toHaveClass(/is-locked/);

    // Move the pointer away, then assert the grip and the bin are gone but the padlock remains.
    await page.mouse.move(0, 0);
    await expect(swatch.locator(".playground-swatch-grip")).toBeHidden();
    await expect(swatch.locator(".playground-swatch-action.is-on")).toBeVisible();
    await expect(swatch.locator(".playground-swatch-action:not(.is-on)")).toBeHidden();
  });

  test("the preview goes to real full screen and comes back", async ({ page }) => {
    await openPlayground(page);
    await page.locator("#playground-fullscreen").click();

    await expect(page.locator(".playground-preview")).toHaveClass(/is-fullscreen/);
    // The Fullscreen API, not an in-page overlay.
    expect(await page.evaluate(() => document.fullscreenElement?.classList.contains("playground-preview") ?? false)).toBe(true);

    // Not Escape: exiting full screen with it is browser chrome, which a page key event cannot drive.
    await page.locator("#playground-fullscreen").click();
    await expect(page.locator(".playground-preview")).not.toHaveClass(/is-fullscreen/);
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    // And it is back inside the panel, not left parked on the body.
    expect(await page.evaluate(() => Boolean(document.querySelector(".panel-playground .playground-preview")))).toBe(true);
  });

  test("every scene renders from the working palette", async ({ page }) => {
    await openPlayground(page);
    for (const scene of ["blend", "ui", "poster", "chart"]) {
      await page.locator(`.playground-scene-tab[data-scene="${scene}"]`).click();
      await expect(page.locator(`.playground-stage .scene-${scene}`)).toBeVisible();
    }
  });

  test("the working set survives a reload", async ({ page }) => {
    await openPlayground(page);
    const before = await hexes(page);

    await page.reload();
    await expect(page.locator("body")).toHaveClass(/is-ready/);
    await page.locator('[data-view-target="playground"]:visible').click();

    expect(await hexes(page)).toEqual(before);
  });

  test("undo and redo step through the shuffle history", async ({ page }) => {
    await openPlayground(page);
    const first = await hexes(page);
    await page.locator("#playground-shuffle").click();
    const second = await hexes(page);
    expect(second).not.toEqual(first);

    await page.locator("#playground-undo").click();
    expect(await hexes(page)).toEqual(first);

    await page.locator("#playground-redo").click();
    expect(await hexes(page)).toEqual(second);
  });

  test("a palette opened from the library is edited in place", async ({ page }) => {
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
              name: "Sunset Ridge",
              lastModified: 1,
              folderId: null,
              colors: [
                { id: "c0", name: "a", rgb: [1, 0, 0] },
                { id: "c1", name: "b", rgb: [0, 1, 0] },
                { id: "c2", name: "c", rgb: [0, 0, 1] },
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

    await page.locator('.palette-card [data-action-key="playground"]').click();
    await expect(page.locator(".panel-playground")).toBeVisible();
    // The palette's own colors, not a fresh random set.
    expect(await hexes(page)).toEqual(["#FF0000", "#00FF00", "#0000FF"]);
    await expect(page.locator("#playground-source")).toContainText("Sunset Ridge");

    await page.locator("#playground-shuffle").click();
    const shuffled = await hexes(page);
    await page.locator("#playground-save").click();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("palette-studio.palettes") ?? "{}"));
    // Updated in place: still one palette, still the same id and name.
    expect(stored.palettes).toHaveLength(1);
    expect(stored.palettes[0].id).toBe("p0");
    expect(stored.palettes[0].name).toBe("Sunset Ridge");
    expect(stored.palettes[0].colors).toHaveLength(shuffled.length);
  });

  test("detaching makes the next save create a new palette", async ({ page }) => {
    // Wide enough for the unlink link: it is dropped from a narrow bar to keep it on one line.
    await page.setViewportSize({ width: 1600, height: 900 });
    await openPlayground(page);
    await page.locator("#playground-save").click();
    await expect(page.locator("#playground-source")).toBeVisible();

    await page.locator("#playground-detach").click();
    await expect(page.locator("#playground-source")).toBeHidden();

    await page.locator("#playground-save").click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("palette-studio.palettes") ?? "{}"));
    expect(stored.palettes).toHaveLength(2);
  });

  test("saving adds the working palette to the library", async ({ page }) => {
    await openPlayground(page);
    const colors = await hexes(page);

    await page.locator("#playground-save").click();
    await page.locator('[data-view-target="library"]:visible').click();

    const card = page.locator(".palette-card").first();
    await expect(card).toBeVisible();
    await expect(card.locator(".palette-title")).toContainText("Playground");

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("palette-studio.palettes");
      return raw ? JSON.parse(raw) : null;
    });
    const saved = stored.palettes[0].colors.map((color: { rgb: number[] }) =>
      color.rgb
        .map((channel: number) =>
          Math.round(channel * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
        .toUpperCase(),
    );
    expect(saved).toEqual(colors.map((color) => color.replace("#", "")));
  });

  test("a selected scene remains indicated when its tab overflows", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openPlayground(page);

    const more = page.locator(".playground-scene-more");
    await more.click();
    await page.locator('.playground-scene-menu .playground-scene-tab[data-scene="chart"]').click();

    const active = page.locator('.playground-scene-tab[data-scene="chart"]');
    if (await active.evaluate((tab) => tab.parentElement?.classList.contains("playground-scene-menu") ?? false)) {
      await expect(more).toHaveClass(/is-active/);
      await expect(more).toHaveAttribute("aria-label", /Charts/);
    } else {
      await expect(page.locator('.playground-scene-primary .playground-scene-tab[data-scene="chart"]')).toHaveClass(/is-active/);
    }
  });

  test("the Interface scene stacks its mobile rail above the content", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayground(page);
    const interfaceTab = page.locator('.playground-scene-primary .playground-scene-tab[data-scene="ui"]');
    if (await interfaceTab.isVisible()) {
      await interfaceTab.click();
    } else {
      await page.locator(".playground-scene-more").click();
      await page.locator('.playground-scene-menu .playground-scene-tab[data-scene="ui"]').click();
    }

    const geometry = await page.locator(".scene-ui").evaluate((scene) => {
      const rail = scene.querySelector<HTMLElement>(".ui-rail")!.getBoundingClientRect();
      const brand = scene.querySelector<HTMLElement>(".ui-brand")!.getBoundingClientRect();
      const body = scene.querySelector<HTMLElement>(".ui-body")!.getBoundingClientRect();
      return {
        rail: { left: rail.left, right: rail.right, bottom: rail.bottom },
        brand: { left: brand.left, right: brand.right },
        body: { left: body.left, top: body.top },
      };
    });

    expect(geometry.rail.bottom).toBeLessThanOrEqual(geometry.body.top + 1);
    expect(geometry.brand.left).toBeGreaterThanOrEqual(geometry.rail.left);
    expect(geometry.brand.right).toBeLessThanOrEqual(geometry.rail.right);
    expect(geometry.body.left).toBeGreaterThanOrEqual(geometry.rail.left);
  });

  test("mobile swatches use the editor control order without gaps", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayground(page);

    const positions = await page.locator(SWATCH).evaluateAll((swatches) =>
      swatches.slice(0, 2).map((swatch) => {
        const grip = swatch.querySelector<HTMLElement>(".playground-swatch-grip")!.getBoundingClientRect();
        const label = swatch.querySelector<HTMLElement>(".playground-swatch-label")!.getBoundingClientRect();
        const actions = swatch.querySelector<HTMLElement>(".playground-swatch-actions")!.getBoundingClientRect();
        const actionButtons = [...swatch.querySelectorAll<HTMLElement>(".playground-swatch-action")].map((button) =>
          button.getBoundingClientRect(),
        );
        const hex = swatch.querySelector<HTMLElement>(".playground-swatch-hex")!.getBoundingClientRect();
        const name = swatch.querySelector<HTMLElement>(".playground-swatch-name")!.getBoundingClientRect();
        const row = swatch.getBoundingClientRect();
        return {
          row: { top: row.top, bottom: row.bottom },
          grip: { left: grip.left, right: grip.right },
          label: { left: label.left, right: label.right },
          actions: { left: actions.left, right: actions.right },
          actionGap: actionButtons[1].left - actionButtons[0].right,
          actionIconWidth: swatch.querySelector<HTMLElement>(".playground-swatch-action .icon")!.getBoundingClientRect().width,
          gripWidth: grip.width,
          centers: {
            row: row.top + row.height / 2,
            grip: grip.top + grip.height / 2,
            hex: hex.top + hex.height / 2,
            name: name.top + name.height / 2,
            actions: actions.top + actions.height / 2,
          },
        };
      }),
    );

    expect(positions[0].grip.right).toBeLessThanOrEqual(positions[0].label.left + 1);
    expect(positions[0].label.right).toBeLessThanOrEqual(positions[0].actions.left + 1);
    expect(positions[0].actionGap).toBe(6);
    expect(positions[0].actionIconWidth).toBe(14);
    expect(positions[0].gripWidth).toBe(22);
    expect(Math.abs(positions[0].centers.grip - positions[0].centers.row)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions[0].centers.hex - positions[0].centers.row)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions[0].centers.name - positions[0].centers.row)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions[0].centers.actions - positions[0].centers.row)).toBeLessThanOrEqual(1);
    expect(Math.abs(positions[0].row.bottom - positions[1].row.top)).toBeLessThanOrEqual(1);
    await expect(page.locator(`${SWATCH} .playground-swatch-hex`).first()).toHaveText(/^#/);
  });
});
