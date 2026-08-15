import playwright from "@playwright/test";

const { expect, test } = playwright;

const seedLibrary = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: Array.from({ length: 5 }, (_, index) => ({
          id: `p${index}`,
          name: `Palette ${index}`,
          lastModified: 1_700_000_000_000,
          colors: ["00aaff", "f2c94c", "ff763f"].map((hex, position) => ({
            id: `c-${index}-${position}`,
            name: "Color",
            rgb: [
              Number.parseInt(hex.slice(0, 2), 16) / 255,
              Number.parseInt(hex.slice(2, 4), 16) / 255,
              Number.parseInt(hex.slice(4, 6), 16) / 255,
            ],
          })),
        })),
        activePaletteId: "p0",
      }),
    );
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
};

/*
 * The row of buttons under each palette is measured before it is shown — it decides how many fit and
 * puts the rest behind a "…" — and it is `visibility: hidden` until that measurement lands. The card
 * is assembled detached, so the measurement cannot happen at construction, and leaving it to the
 * ResizeObserver put it a whole animation frame later: one painted frame with the row blank. Once
 * per re-render, and a signed-in reload re-renders the library twice after the app is on screen,
 * which is the two brief grey-outs people reported. Nothing else on the card flickered, because
 * nothing else on the card is in that row.
 */
test("a re-render never paints a palette card with its action row hidden", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLibrary(page);

  await page.evaluate(() => {
    const w = window as unknown as { __attached: number[]; __ready: number[]; __frame: number };
    w.__frame = 0;
    w.__attached = [];
    w.__ready = [];
    const count = () => {
      w.__frame += 1;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);

    // When the cards land in the document.
    new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.querySelector(".palette-actions-lead")) {
            w.__attached.push(w.__frame);
          }
        });
      });
    }).observe(document.querySelector("#palette-list")!, { childList: true, subtree: true });

    // And when their action rows stop being hidden.
    new MutationObserver((records) => {
      records.forEach((record) => {
        const target = record.target as HTMLElement;
        if (target.classList.contains("palette-actions-lead") && target.dataset.overflowReady === "true") {
          w.__ready.push(w.__frame);
        }
      });
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-overflow-ready"] });
  });
  await page.waitForTimeout(120);

  // Re-render the library the way a cloud sync does, with the app already on screen.
  await page.locator("#format").selectOption("html");
  await page.waitForTimeout(600);

  const { attached, ready } = await page.evaluate(() => {
    const w = window as unknown as { __attached: number[]; __ready: number[] };
    return { attached: w.__attached, ready: w.__ready };
  });

  expect(attached.length).toBeGreaterThan(0);
  expect(ready.length).toBeGreaterThan(0);

  /*
   * Every row has to be measured in the frame its card was attached. A row still hidden when that
   * frame ends is a row the browser painted blank.
   */
  const attachFrame = Math.max(...attached);
  const attachedThen = attached.filter((frame) => frame === attachFrame).length;
  const readyThen = ready.filter((frame) => frame === attachFrame).length;
  expect(readyThen).toBeGreaterThanOrEqual(attachedThen);
});
