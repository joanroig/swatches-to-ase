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

/*
 * Committing the rename used to re-render the whole library, which threw the header away between
 * the delete button's mousedown and its mouseup — so the click never fired and deleting a folder
 * silently did nothing whenever the name had just been edited.
 */
test("a header button still works while the rename field is open", async ({ page }) => {
  await seed(page, ["Alpha"]);
  await page.locator("#create-folder").click();
  await expect(page.locator(".library-group")).toHaveCount(2);
  const group = page.locator(".library-group").first();

  await group.locator('.library-group-actions [title="Rename folder"]').click();
  await expect(group.locator(".library-group-rename")).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await group.getByRole("button", { name: "Delete folder" }).click();

  await expect(page.locator(".library-group")).toHaveCount(1);
});

/* Opening the field used to grow the header from 56px to 67px and drag the count badge off the end
   of the row with it. Nothing around the name may move when an edit starts. */
test("opening the rename field moves nothing else in the header", async ({ page }) => {
  await seed(page, ["Alpha"]);
  await page.locator("#create-folder").click();
  const group = page.locator(".library-group").first();
  const header = group.locator(".library-group-header");
  const count = group.locator(".palette-count");

  const idle = { header: await boxOf(header), count: await boxOf(count) };
  await group.locator('.library-group-actions [title="Rename folder"]').click();
  await expect(group.locator(".library-group-rename")).toBeVisible();
  const editing = { header: await boxOf(header), count: await boxOf(count) };

  expect(editing.header.height).toBeCloseTo(idle.header.height, 1);
  expect(editing.count.x).toBeCloseTo(idle.count.x, 1);
});

/* The field sizes itself to its value; `flex: 1 1 auto` had it swallow the whole header. */
test("the rename field is as wide as its text, not as the header", async ({ page }) => {
  await seed(page, ["Alpha"]);
  await page.locator("#create-folder").click();
  const group = page.locator(".library-group").first();
  await group.locator('.library-group-actions [title="Rename folder"]').click();

  const input = group.locator(".library-group-rename");
  await expect(input).toBeVisible();
  const narrow = (await boxOf(input)).width;
  const header = (await boxOf(group.locator(".library-group-header"))).width;
  expect(narrow).toBeLessThan(header / 2);

  await input.fill("A folder name considerably longer than the last one");
  expect((await boxOf(input)).width).toBeGreaterThan(narrow);
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

test("a collapsed folder stays collapsed across a reload", async ({ page }) => {
  await seed(page, ["Alpha"]);
  const group = page.locator('.library-group[data-folder-id="__unfiled__"]');
  await group.locator(".library-group-toggle").click();
  await expect(group).toHaveClass(/is-collapsed/);

  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator('.library-group[data-folder-id="__unfiled__"]')).toHaveClass(/is-collapsed/);
});

test("a folder is renamed in place, without a browser prompt", async ({ page }) => {
  await seed(page, ["Alpha"]);
  await page.locator("#create-folder").click();
  const group = page.locator(".library-group[data-folder-id]:not([data-folder-id='__unfiled__'])").first();

  // `window.prompt` is a no-op in Electron, so renaming happens inline. Fail loudly if one appears.
  page.on("dialog", (dialog) => {
    throw new Error(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`);
  });

  await group.locator('.library-group-actions [title="Rename folder"]').click();
  const input = group.locator(".library-group-rename");
  await expect(input).toBeVisible();
  await input.fill("Campaign");
  await input.press("Enter");

  await expect(group.locator(".library-group-name")).toHaveText("Campaign");
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".library-group-name").first()).toHaveText("Campaign");
});
