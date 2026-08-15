import playwright from "@playwright/test";

const { expect, test } = playwright;

/*
 * A standing check that nothing is cut off or pushed off screen.
 *
 * Written as a sweep rather than as assertions about particular elements: the faults this catches
 * have all been in places nobody was looking — a decorative blur reaching past the window, a head
 * bleeding 4px further than its panel's gutter, two breakpoints both matching at exactly 960px.
 */
const WIDTHS = [320, 360, 390, 430, 560, 720, 820, 959, 960, 1024, 1280, 1920];
const VIEWS = ["library", "playground", "discover"] as const;

const seed = async (page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("palette-studio.preferences", JSON.stringify({ colorNameFormat: "html", colorNotation: "hex" }));
    localStorage.setItem(
      "palette-studio.palettes",
      JSON.stringify({
        palettes: ["Shade Tropical Rain Forest", "Kitchen Plant", "Midnight Produce Extra Long Name"].map((name, index) => ({
          id: `p${index}`,
          name,
          lastModified: 100 - index,
          folderId: index === 0 ? "f1" : null,
          colors: [0, 1, 2, 3, 4].map((step) => ({
            id: `p${index}-c${step}`,
            name: "Screamin Green",
            rgb: [0.15 + step * 0.16, 0.5 - step * 0.05, 0.3 + index * 0.15],
          })),
        })),
        folders: [{ id: "f1", name: "A folder with a fairly long name" }],
        activePaletteId: "p0",
      }),
    );
  });
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/is-ready/);
};

const AUDIT = `() => {
  const vw = document.documentElement.clientWidth;
  const faults = [];
  if (document.documentElement.scrollWidth > vw + 1) faults.push("page-hscroll +" + (document.documentElement.scrollWidth - vw));
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };
  document.body.querySelectorAll("*").forEach((el) => {
    if (!el.getClientRects().length) return;
    // Geometry inside an <svg> is painted into its viewport, not laid out on the page: the brand
    // mark's bands are drawn well past the viewBox on purpose and are cropped by it. The <svg>
    // element itself is still audited, which is the box that occupies space.
    if (el.ownerSVGElement) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return;
    // Screen-reader text is clipped on purpose, and anything inside a scroll strip is reachable.
    if (el.classList.contains("sr-only") || el.closest(".sr-only") || inScroller(el)) return;
    const r = el.getBoundingClientRect();
    const name = (el.id ? "#" + el.id : "." + (el.className || "").toString().split(" ")[0]).slice(0, 40);
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) faults.push("offscreen-x " + name);
    const clipsX = cs.overflowX === "hidden" || cs.overflowX === "clip";
    const cut = el.scrollWidth - el.clientWidth;
    if (clipsX && cut > 1 && cs.textOverflow !== "ellipsis" && el.children.length === 0 && (el.textContent || "").trim())
      faults.push("text-cut " + name + " +" + cut);
  });
  return [...new Set(faults)];
}`;

test("no view is cut off or pushed off screen at any width", async ({ page }) => {
  test.setTimeout(300_000);
  const faults: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    for (const view of VIEWS) {
      // Set the view directly: below 960px the switcher is a bottom bar that can sit out of reach,
      // and this is a check on layout rather than on navigation.
      await page.evaluate((target) => {
        const shell = document.querySelector<HTMLElement>(".app-shell")!;
        shell.dataset.view = target;
        document.querySelectorAll<HTMLElement>("[data-view-section]").forEach((section) => {
          section.classList.toggle("is-active", section.dataset.viewSection === target);
        });
      }, view);
      await page.waitForTimeout(320);
      const found = (await page.evaluate(new Function(`return (${AUDIT})()`) as never)) as string[];
      found.forEach((fault) => faults.push(`${width} ${view}: ${fault}`));
    }
  }
  expect(faults, faults.join("\n")).toEqual([]);
});

/*
 * The rail does two things at once, and they used to be in conflict: its top must never scroll
 * away, and its bottom belongs on the panel's lower edge rather than out over the footer.
 */
test("the rail's top stays put and its bottom lands on the panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  const measure = () =>
    page.evaluate(() => {
      const brand = document.querySelector<HTMLElement>(".brand--sidebar")!.getBoundingClientRect();
      const bottom = document.querySelector<HTMLElement>(".sidebar-bottom")!.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>(".panel.is-active")!.getBoundingClientRect();
      return { brandTop: Math.round(brand.top), overshoot: Math.round(bottom.bottom - panel.bottom) };
    });

  const atRest = await measure();
  expect(atRest.brandTop).toBeGreaterThan(0);
  // Never past the panel's lower edge — how far short depends on how tall the library happens to be.
  expect(atRest.overshoot).toBeLessThanOrEqual(0);

  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(220);
  expect((await measure()).brandTop).toBe(atRest.brandTop);

  // The far bottom is where both used to fail — the whole rail was dragged up with the footer.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
  const atEnd = await measure();
  expect(atEnd.brandTop).toBe(atRest.brandTop);
  // Settled exactly on the panel's edge, which is the whole point of sticking to the bottom.
  expect(atEnd.overshoot).toBe(0);
});
