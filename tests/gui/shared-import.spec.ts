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

  // The avatar is the probe: a public asset referenced by a relative src, so it only loads if a
  // deep share path still resolves against the site root.
  await expect(page.locator(".user-avatar").first()).toHaveJSProperty("complete", true);
  await expect
    .poll(() =>
      page
        .locator(".user-avatar")
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => new URL("icons/settings.svg", document.baseURI).pathname)).toBe("/icons/settings.svg");
});

/*
 * The link carries the palette's name and whoever sent it, so the preview can say both. Before, the
 * colors were the whole of the URL and every shared palette arrived titled "Shared palette", from
 * nobody.
 */
test("a shared link shows the palette name and who sent it", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c?name=Sunset%20Ridge&by=Joan&uid=uid-123");

  const modal = page.locator("#view-modal");
  await expect(modal).toHaveClass(/is-open/);
  await expect(modal.locator("#view-subtitle")).toContainText("Sunset Ridge");
  await expect(modal.locator("#view-subtitle")).toContainText("Joan");

  // Read once and taken off, so a reload is not a second invitation.
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
});

/* No name on the link is the old link, and it still works. */
test("a link without details still previews", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c");

  await expect(page.locator("#view-modal")).toHaveClass(/is-open/);
  await expect(page.locator("#view-modal #view-title")).toHaveText("Shared palette");
  await expect(page.locator("#view-modal .view-swatch")).toHaveCount(2);
});

/* Falls back to the id when the account has no name to show. */
test("a shared link falls back to the sender's id", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c?name=Dusk&uid=uid-123");

  await expect(page.locator("#view-modal #view-subtitle")).toContainText("uid-123");
});

/*
 * The Discover cards have let you press an author's name for a while; the dialog you reach from them
 * did not, and neither did a shared link. The name you can see should be the name you can press.
 */
test("the sender's name in the preview is a button", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c?name=Dusk&by=Joan&uid=uid-123");

  const author = page.locator("#view-subtitle .view-author-button");
  await expect(author).toHaveText(/Joan/);
  await expect(author).toHaveAttribute("title", /Joan/);
  // The rest of the subtitle is still there, either side of it.
  await expect(page.locator("#view-subtitle")).toContainText("Dusk");
});

/* Nothing to open, nothing to press: an old link has no sender behind the text. */
test("a sender with no id is plain text", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c?name=Dusk&by=Joan");

  await expect(page.locator("#view-subtitle")).toContainText("Joan");
  await expect(page.locator("#view-subtitle .view-author-button")).toHaveCount(0);
});

/*
 * The profile it opens has to land in front of the palette it was opened from.
 *
 * The two dialogs were ranked by a fixed z-index, decided for the Discover order — profile first,
 * then a palette from it. A shared link opens them the other way round, so the profile came up
 * behind a dialog that covers the screen, and every click went to the palette instead.
 */
test("the sender's profile opens in front of the palette", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c?name=Dusk&by=Joan&uid=uid-123");

  await page.locator("#view-subtitle .view-author-button").click();
  await expect(page.locator("#discover-profile-modal")).toHaveAttribute("aria-hidden", "false");

  const stack = await page.evaluate(() => {
    const zOf = (id: string) => Number.parseInt(getComputedStyle(document.querySelector(id)!).zIndex, 10);
    const middle = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return {
      profile: zOf("#discover-profile-modal"),
      view: zOf("#view-modal"),
      // What a click in the middle of the screen would actually reach.
      reachable: middle?.closest(".modal")?.id ?? "none",
    };
  });
  expect(stack.profile).toBeGreaterThan(stack.view);
  expect(stack.reachable).toBe("discover-profile-modal");
});

/* And closing it puts you back on the palette, rather than clearing the screen. */
test("dismissing the profile leaves the shared palette up", async ({ page }) => {
  await resetStorage(page);
  await page.goto("/00aaff-f2c94c?name=Dusk&by=Joan&uid=uid-123");

  await page.locator("#view-subtitle .view-author-button").click();
  await expect(page.locator("#discover-profile-modal")).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(page.locator("#discover-profile-modal")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#view-modal")).toHaveAttribute("aria-hidden", "false");

  // A second press takes the palette, which is now the one in front.
  await page.keyboard.press("Escape");
  await expect(page.locator("#view-modal")).toHaveAttribute("aria-hidden", "true");
});
