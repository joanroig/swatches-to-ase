import playwright from "@playwright/test";

const { expect, test } = playwright;

/*
 * `applyRemotePreferences` is what a cloud sync runs on every payload it receives, and a signed-in
 * reload receives at least two. It is reachable without an account through a shared-workspace link,
 * which applies the same preferences the same way — so that is what these drive.
 */
const workspaceUrl = (language: string) => {
  const payload = {
    palettes: [{ name: "Shared workspace", colors: [{ name: "Lagoon", hex: "00aaff" }] }],
    preferences: {
      theme: "studio",
      colorNameFormat: "html",
      addBlackWhite: false,
      exportFormat: "all",
      colorNotation: "hex",
      generateStyle: "shade",
      motion: "system",
      language,
    },
    activePaletteIndex: 0,
    user: { name: "Someone" },
  };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(payload)), "utf8").toString("base64");
  return `/?share=${encodeURIComponent(encoded)}`;
};

/** The icon, and the label beside it, for a button that carries both a `data-i18n` and an icon. */
const buttonState = (page, selector: string) =>
  page.locator(selector).evaluate((button: HTMLElement) => {
    const icon = button.firstElementChild;
    return {
      hasIcon: icon instanceof SVGElement && icon.classList.contains("icon"),
      iconHref: icon?.querySelector("use")?.getAttribute("href") ?? null,
      label: button.textContent?.trim() ?? "",
    };
  });

/*
 * New folder, Import, Export all and New are described twice: `data-i18n` says what they read, and
 * `setButtonContent` gives them an icon. A translation pass used to set `textContent` outright,
 * which threw the icon away and left bare text — visible as soon as anything applied preferences
 * without an app-wide relabel behind it to build them back.
 */
test("applying remote preferences leaves the icon buttons intact", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  const before = await buttonState(page, "#create-folder");
  expect(before.hasIcon).toBe(true);

  await page.goto(workspaceUrl("system"));
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".palette-card")).toHaveCount(1);

  const after = await buttonState(page, "#create-folder");
  expect(after).toEqual(before);

  for (const selector of ["#open-import", "#open-export", "#open-generate"]) {
    expect((await buttonState(page, selector)).hasIcon).toBe(true);
  }
});

/* A language that really is different still has to take, icons and all. */
test("a remote language change still relabels, and keeps the icons", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(workspaceUrl("es"));
  await expect(page.locator("body")).toHaveClass(/is-ready/);
  await expect(page.locator(".palette-card")).toHaveCount(1);

  const folder = await buttonState(page, "#create-folder");
  expect(folder.hasIcon).toBe(true);
  expect(folder.iconHref).toBe("#icon-folderPlus");
  expect(folder.label).not.toBe("New folder");
  expect(folder.label.length).toBeGreaterThan(0);
});
