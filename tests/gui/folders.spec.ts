import playwright from "@playwright/test";

const { expect, test } = playwright;

const seed = async (page, names: string[]) => {
  await page.goto("/");
  await page.evaluate((paletteNames) => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: (paletteNames as string[]).map((name, index) => ({
          id: `p${index}`,
          name,
          lastModified: 1_700_000_000_000 - index,
          colors: [{ id: `p${index}-c0`, name: "c", rgb: [0.2, 0.4, 0.8] }],
        })),
        folders: [],
        activePaletteId: "p0",
      }),
    );
  }, names);
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".palette-card")).toHaveCount(names.length);
};

const titlesInFolder = (page, folderId: string) =>
  page
    .locator(`.palette-grid[data-folder-id="${folderId}"] .palette-title`)
    .allInnerTexts()
    .then((values: string[]) => values.map((value) => value.trim()));

const boxOf = async (locator) => {
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

test("palettes start unfiled and a new folder can be created", async ({ page }) => {
  await seed(page, ["Alpha", "Beta"]);

  await expect(page.locator('.palette-grid[data-folder-id="__unfiled__"]')).toHaveCount(1);
  expect(await titlesInFolder(page, "__unfiled__")).toEqual(["Alpha", "Beta"]);

  await page.locator("#create-folder").click();
  await expect(page.locator(".library-group")).toHaveCount(2);
  await expect(page.locator(".library-group-name").first()).toHaveText("New folder");
});

test("dragging a palette into a folder files it, and it survives a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await seed(page, ["Alpha", "Beta"]);
  await page.locator("#create-folder").click();
  await expect(page.locator(".library-group")).toHaveCount(2);

  const folderId = await page
    .locator(".library-group")
    .first()
    .evaluate((element: Element) => (element as HTMLElement).dataset.folderId ?? "");
  expect(folderId).not.toBe("");
  expect(folderId).not.toBe("__unfiled__");

  // Cards are dragged by their grip, not by the card body.
  const grip = await boxOf(page.locator(".palette-card").first().locator(".palette-card-grip"));
  const target = await boxOf(page.locator(`.palette-grid[data-folder-id="${folderId}"]`));

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 8, grip.y + grip.height / 2 + 8, { steps: 3 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();

  await expect.poll(() => titlesInFolder(page, folderId)).toEqual(["Alpha"]);
  await expect.poll(() => titlesInFolder(page, "__unfiled__")).toEqual(["Beta"]);

  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect.poll(() => titlesInFolder(page, folderId)).toEqual(["Alpha"]);
});

test("search filters palettes by name and by hex", async ({ page }) => {
  await seed(page, ["Sunset", "Ocean"]);

  await page.locator("#library-search").fill("sun");
  await expect(page.locator(".palette-card")).toHaveCount(1);
  await expect(page.locator(".palette-title")).toHaveText("Sunset");

  // The seeded colour is rgb(0.2, 0.4, 0.8) -> #3366cc.
  await page.locator("#library-search").fill("3366cc");
  await expect(page.locator(".palette-card")).toHaveCount(2);

  await page.locator("#library-search").fill("nothing-matches");
  await expect(page.locator(".palette-card")).toHaveCount(0);
  await expect(page.locator("#library-empty-search")).toBeVisible();

  await page.locator("#library-search").fill("");
  await expect(page.locator(".palette-card")).toHaveCount(2);
});

test("deleting a folder keeps its palettes", async ({ page }) => {
  await seed(page, ["Alpha"]);
  await page.locator("#create-folder").click();
  await expect(page.locator(".library-group")).toHaveCount(2);

  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(".library-group").first().getByRole("button", { name: "Delete folder" }).click();

  await expect(page.locator(".library-group")).toHaveCount(1);
  await expect(page.locator(".palette-card")).toHaveCount(1);
  expect(await titlesInFolder(page, "__unfiled__")).toEqual(["Alpha"]);
});

test("a folder can be collapsed and expanded", async ({ page }) => {
  await seed(page, ["Alpha"]);
  const group = page.locator('.library-group[data-folder-id="__unfiled__"]');
  await expect(group.locator(".palette-card")).toHaveCount(1);

  await group.locator(".library-group-toggle").click();
  await expect(group).toHaveClass(/is-collapsed/);
  await expect(group.locator(".palette-card")).toBeHidden();

  await group.locator(".library-group-toggle").click();
  await expect(group).not.toHaveClass(/is-collapsed/);
  await expect(group.locator(".palette-card")).toBeVisible();
});
