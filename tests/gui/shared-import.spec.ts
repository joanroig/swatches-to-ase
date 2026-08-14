import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

const sharedUrl = () => {
  const payload = {
    name: "Shared",
    colors: [
      { name: "Lagoon", hex: "00aaff" },
      { name: "Citrus", hex: "f2c94c" },
    ],
  };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(payload)), "utf8").toString("base64");
  return `/?import=${encodeURIComponent(encoded)}`;
};

/* Shown before it is taken: the link used to raise a browser confirm naming colors you could not see. */
test("a shared palette URL previews the palette instead of confirming", async ({ page }) => {
  await resetStorage(page);
  page.on("dialog", (dialog) => {
    throw new Error(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`);
  });

  await page.goto(sharedUrl());

  const modal = page.locator("#view-modal");
  await expect(modal).toHaveClass(/is-open/);
  await expect(modal.locator("#view-title")).toHaveText("Shared palette");
  await expect(modal.locator("#view-subtitle")).toContainText("Shared");
  // Two swatches, so the colors are on screen before the decision.
  await expect(modal.locator(".view-swatch")).toHaveCount(2);
  // Nothing is in the library until Import is pressed.
  await expect(page.locator(".palette-card")).toHaveCount(0);
});

test("importing from the preview adds the palette", async ({ page }) => {
  await resetStorage(page);
  await page.goto(sharedUrl());
  await expect(page.locator("#view-modal")).toHaveClass(/is-open/);

  await page.locator("#view-save").click();

  await expect(page.locator("#view-modal")).not.toHaveClass(/is-open/);
  const card = page.locator(".palette-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".palette-title")).toHaveText("Shared");
});

/*
 * Save and edit is one intent, so it is one button: the import has to land first — the editor works
 * on a palette in the library — and then the editor opens on it without a trip through the library.
 */
test("save and edit imports the palette and opens it in the editor", async ({ page }) => {
  await resetStorage(page);
  await page.goto(sharedUrl());
  await expect(page.locator("#view-modal")).toHaveClass(/is-open/);

  await page.locator("#view-save-edit").click();

  await expect(page.locator("#view-modal")).not.toHaveClass(/is-open/);
  await expect(page.locator("#editor-modal")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#palette-name")).toHaveValue("Shared");
  // Kept, so the edits have somewhere to persist to — and not reported as a dismissal.
  await expect(page.locator(".palette-card")).toHaveCount(1);
  await expect(page.locator(".toast", { hasText: "not imported" })).toHaveCount(0);
});

/* Closing the preview is the decline — there is no separate "no" to press, so it has to say so. */
test("closing the preview leaves the library untouched and says why", async ({ page }) => {
  await resetStorage(page);
  await page.goto(sharedUrl());
  await expect(page.locator("#view-modal")).toHaveClass(/is-open/);

  await page.keyboard.press("Escape");

  await expect(page.locator("#view-modal")).not.toHaveClass(/is-open/);
  await expect(page.locator(".palette-card")).toHaveCount(0);
  await expect(page.locator(".toast").last()).toContainText("not imported");
});

/* Escape, the backdrop and the close button all mean the same thing. */
test("dismissing by the close button also reports it", async ({ page }) => {
  await resetStorage(page);
  await page.goto(sharedUrl());
  await expect(page.locator("#view-modal")).toHaveClass(/is-open/);

  await page.locator('#view-modal [data-close="true"].close-button').click();

  await expect(page.locator(".toast").last()).toContainText("not imported");
  await expect(page.locator(".palette-card")).toHaveCount(0);
});

/* Importing is not a dismissal: the notice must not fire on the way out. */
test("importing does not report a dismissal", async ({ page }) => {
  await resetStorage(page);
  await page.goto(sharedUrl());
  await expect(page.locator("#view-modal")).toHaveClass(/is-open/);

  await page.locator("#view-save").click();

  await expect(page.locator(".palette-card")).toHaveCount(1);
  await expect(page.locator(".toast", { hasText: "not imported" })).toHaveCount(0);
});

test("public assets resolve from a shared URL with a trailing slash", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c/");

  await expect(page.locator(".brand-logo").first()).toHaveJSProperty("complete", true);
  await expect
    .poll(() => page.locator(".brand-logo").first().evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => new URL("icons/settings.svg", document.baseURI).pathname))
    .toBe("/icons/settings.svg");
});
