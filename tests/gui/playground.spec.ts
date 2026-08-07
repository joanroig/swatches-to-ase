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
  await page.locator('.sidebar-nav [data-view-target="playground"]').click();
  await expect(page.locator(".panel-playground")).toBeVisible();
  await expect(page.locator(SWATCH)).toHaveCount(5);
};

const hexes = (page) =>
  page
    .locator(`${SWATCH} .playground-swatch-hex`)
    .allInnerTexts()
    .then((values: string[]) => values.map((value) => value.trim()));

test.describe("playground", () => {
  test("shuffling replaces the working colours", async ({ page }) => {
    await openPlayground(page);
    const before = await hexes(page);

    await page.locator("#playground-shuffle").click();
    const after = await hexes(page);

    expect(after).toHaveLength(before.length);
    expect(after).not.toEqual(before);
  });

  test("a locked colour survives a shuffle", async ({ page }) => {
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

  test("the stepper adds and removes colours", async ({ page }) => {
    await openPlayground(page);
    await page.locator("#playground-add").click();
    await expect(page.locator(SWATCH)).toHaveCount(6);
    await expect(page.locator("#playground-count")).toHaveText("6");

    await page.locator("#playground-remove").click();
    await page.locator("#playground-remove").click();
    await expect(page.locator(SWATCH)).toHaveCount(4);
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
    await page.locator('.sidebar-nav [data-view-target="playground"]').click();

    expect(await hexes(page)).toEqual(before);
  });

  test("saving adds the working palette to the library", async ({ page }) => {
    await openPlayground(page);
    const colors = await hexes(page);

    await page.locator("#playground-save").click();
    await page.locator('.sidebar-nav [data-view-target="library"]').click();

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
    expect(saved).toEqual(colors);
  });
});
