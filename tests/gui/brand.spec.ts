import playwright from "@playwright/test";

const { expect, test } = playwright;

/*
 * The mark is inline SVG rather than an <img>, which is what lets its bands be animated. These
 * guard the two things that costs: the artwork still has to draw, and the flourish has to end where
 * it started — a logo that settles on the wrong colors is worse than one that never moves.
 */

const BANDS = ["rgb(101, 138, 241)", "rgb(97, 224, 197)", "rgb(242, 202, 100)", "rgb(246, 162, 106)", "rgb(230, 69, 72)"];

const visibleBrand = (page) => page.locator(".brand:visible").first();

const bandFills = (brand) =>
  brand.locator(".brand-band").evaluateAll((bands: SVGPathElement[]) => bands.map((band) => getComputedStyle(band).fill));

test("the mark draws its five bands", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const brand = visibleBrand(page);
  await expect(brand.locator(".brand-band")).toHaveCount(5);
  expect(await bandFills(brand)).toEqual(BANDS);

  const box = (await brand.locator(".brand-logo").boundingBox())!;
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeCloseTo(box.width, 0);
});

test("the lockup is not clipped to a pill by the rail", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  /*
   * The regression this guards, and the one that actually cut the logo.
   *
   * `.brand` is a <button>, so it inherits `--radius-pill` from the shared button rule, and the
   * rail clips the row with `overflow: hidden` so the wordmark cannot escape mid-collapse. The two
   * together cropped the whole lockup to a 140x44 pill: the left curve took the corners off the
   * mark, the right curve took them off "STUDIO".
   */
  const row = await visibleBrand(page).evaluate((brand: HTMLElement) => {
    const style = getComputedStyle(brand);
    return {
      radius: Math.max(
        ...["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"].map((corner) =>
          parseFloat(style[corner as never]),
        ),
      ),
      clips: style.overflow === "hidden" || style.overflow === "clip",
    };
  });
  // Either it does not clip, or it has no corner to clip to. It must never be both.
  expect(row.clips && row.radius > 0).toBe(false);
});

test("the mark wears the shipped icon's shape, unframed", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const marks = await page.locator(".brand-logo").evaluateAll((all: SVGSVGElement[]) =>
    all.map((mark) => {
      const style = getComputedStyle(mark);
      return {
        artworkClips: mark.querySelectorAll("clipPath, [clip-path], [mask]").length,
        radius: style.borderTopLeftRadius,
        borderWidth: parseFloat(style.borderTopWidth),
        background: style.backgroundColor,
      };
    }),
  );

  // The splash wears it too, so the logo cannot change shape when the app arrives.
  expect(marks.length).toBeGreaterThan(2);
  marks.forEach((mark) => {
    // One crop, from the box. Carrying the corner in the artwork as well put two rounded
    // rectangles a fraction apart and chamfered the corners where they disagreed.
    expect(mark.artworkClips).toBe(0);
    // A ratio, so the curve is the same shape at every size the mark appears at.
    expect(mark.radius).toMatch(/%$/);
    /*
     * And no frame. The mark is opaque to its own edge, so a border does not surround the artwork —
     * it is drawn over the outermost pixel of it and leaves a grey ring around the bands.
     */
    expect(mark.borderWidth).toBe(0);
    expect(mark.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });
});

test("the mark's silhouette is the shipped icon's, not a cropped version of it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  // Both rasterised at the size the mark is really drawn, supersampled so a sub-pixel bite shows.
  const worstOffsetPx = await visibleBrand(page)
    .locator(".brand-logo")
    .evaluate(async (mark: SVGSVGElement) => {
      const scale = 4;
      const size = Math.round(mark.getBoundingClientRect().width) * scale;
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.width = size;
          image.height = size;
          image.src = src;
        });
      const silhouette = (data: Uint8ClampedArray) => {
        const rows: [number, number][] = [];
        for (let y = 0; y < size; y += 1) {
          let left = -1;
          let right = -1;
          for (let x = 0; x < size; x += 1) {
            if (data[(y * size + x) * 4 + 3] > 128) {
              if (left < 0) left = x;
              right = x;
            }
          }
          rows.push([left, right]);
        }
        return rows;
      };
      const rasterise = (image: HTMLImageElement, round: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;
        if (round) {
          context.beginPath();
          context.roundRect(0, 0, size, size, size * 0.25);
          context.clip();
        }
        context.drawImage(image, 0, 0, size, size);
        return silhouette(context.getImageData(0, 0, size, size).data);
      };

      const bands = [...mark.querySelectorAll(".brand-band")];
      const copy = mark.cloneNode(true) as SVGSVGElement;
      // The fills live in the stylesheet, so they have to be written on before serialising.
      [...copy.querySelectorAll(".brand-band")].forEach((band, index) => {
        band.setAttribute("fill", getComputedStyle(bands[index]).fill);
      });
      copy.setAttribute("width", String(size));
      copy.setAttribute("height", String(size));

      const target = rasterise(await load("favicon.svg"), false);
      const actual = rasterise(
        await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`),
        true,
      );

      let worst = 0;
      actual.forEach(([left, right], y) => {
        const [targetLeft, targetRight] = target[y];
        if (left < 0 || targetLeft < 0) {
          return;
        }
        worst = Math.max(worst, Math.abs(left - targetLeft), Math.abs(right - targetRight));
      });
      return worst / scale;
    });

  // Antialiasing on a curve is worth a fraction of a pixel. The chamfer this guards was four.
  expect(worstOffsetPx).toBeLessThanOrEqual(1);
});

test("the resting mark keeps the shipped icon's bands at the rounded edges", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const wrongBandPixels = await visibleBrand(page)
    .locator(".brand-logo")
    .evaluate(async (mark: SVGSVGElement) => {
      const size = 267;
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
      const rasterise = (image: HTMLImageElement, round: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;
        if (round) {
          context.beginPath();
          context.roundRect(0, 0, size, size, size * 0.25);
          context.clip();
        }
        context.drawImage(image, 0, 0, size, size);
        return context.getImageData(0, 0, size, size).data;
      };

      const bands = [...mark.querySelectorAll(".brand-band")];
      const copy = mark.cloneNode(true) as SVGSVGElement;
      [...copy.querySelectorAll(".brand-band")].forEach((band, index) => {
        band.setAttribute("fill", getComputedStyle(bands[index]).fill);
      });
      copy.setAttribute("width", String(size));
      copy.setAttribute("height", String(size));

      const target = rasterise(await load("favicon.svg"), false);
      const actual = rasterise(
        await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`),
        true,
      );
      let wrong = 0;
      for (let index = 0; index < target.length; index += 4) {
        const targetIsRed = target[index] === 230 && target[index + 1] === 69 && target[index + 2] === 72;
        const actualIsBlue = actual[index] === 101 && actual[index + 1] === 138 && actual[index + 2] === 241;
        if (targetIsRed && actualIsBlue) wrong += 1;
      }
      return wrong;
    });

  // The following cycle used to overlap the red band and leave a blue wedge in the top-right.
  expect(wrongBandPixels).toBe(0);
});

test("the sidebar does not clip the logo glow", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const clippingAncestor = await page.locator(".brand--sidebar .brand-logo").evaluate((mark: Element) => {
    for (let node = mark.parentElement; node && node !== document.body; node = node.parentElement) {
      if (["hidden", "clip"].includes(getComputedStyle(node).overflow)) {
        return node.className;
      }
    }
    return null;
  });

  expect(clippingAncestor).toBeNull();
});

test("the wordmark's last letter survives the clip that contains it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  /*
   * "STUDIO" is tracked out so it justifies across the width of "Palette" above it, which puts a
   * full letter-space of empty box past the final letter. The box overhangs whatever clips it; the
   * ink must not.
   */
  const overhang = await visibleBrand(page).evaluate((brand: HTMLElement) => {
    const subtitle = brand.querySelector(".brand-subtitle")!;
    const text = subtitle.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, text.textContent!.length - 1);
    range.setEnd(text, text.textContent!.length);
    const tracking = parseFloat(getComputedStyle(subtitle).letterSpacing) || 0;
    // The range rect includes the trailing tracking, which is empty space, not ink.
    const inkRight = range.getBoundingClientRect().right - tracking;

    // Measured against whatever actually clips, wherever that has been put.
    let edge = brand.getBoundingClientRect().right;
    for (let node = subtitle.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).overflow !== "visible") {
        edge = Math.min(edge, node.getBoundingClientRect().right);
      }
    }
    return inkRight - edge;
  });
  expect(overhang).toBeLessThanOrEqual(0);
});

test("pressing the wordmark slides the colors across and lands back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  // Pressed and sampled inside the page: the run is under a second, and a round trip per sample
  // would land wherever it landed.
  const samples = await visibleBrand(page).evaluate(async (brand: HTMLElement) => {
    const bands = brand.querySelector(".brand-bands")!;
    const read = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(bands).transform);
      return { x: matrix.e, fills: [...brand.querySelectorAll(".brand-band")].map((band) => getComputedStyle(band).fill) };
    };
    brand.click();
    const frames: { x: number; fills: string[] }[] = [];
    for (let step = 0; step < 10; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      frames.push(read());
    }
    return frames;
  });

  // It travels — and it travels smoothly, so no two consecutive samples sit on the same spot the
  // way five discrete steps would.
  const positions = samples.map((frame) => frame.x);
  expect(Math.min(...positions)).toBeLessThan(-40);
  expect(new Set(positions.map((x) => x.toFixed(1))).size).toBeGreaterThan(4);

  // The colors themselves never change. The movement is the artwork travelling, not swatches
  // swapping places.
  samples.forEach((frame) => expect(frame.fills).toEqual(BANDS));

  await expect(visibleBrand(page)).not.toHaveClass(/is-cycling/);
  // And it comes to rest exactly where it started, which is what makes the loop close.
  const resting = await visibleBrand(page)
    .locator(".brand-bands")
    .evaluate((bands: Element) => new DOMMatrixReadOnly(getComputedStyle(bands).transform).e);
  expect(resting).toBe(0);
});

test("the mark stays covered all the way through the slide", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  /*
   * Each band is drawn as a parallelogram just long enough to cover the icon where it sits, so the
   * one at the top-left does not reach the top edge at all. Slide the row and those ends come into
   * view as wedges of bare background — which is why the bands are drawn several times their length
   * here. Sampled across the travel, inside the rounded crop.
   */
  const transparency = await visibleBrand(page)
    .locator(".brand-logo")
    .evaluate(async (mark: SVGSVGElement) => {
      const size = 120;
      const bands = [...mark.querySelectorAll(".brand-band")];
      const results: { at: number; transparent: number }[] = [];

      for (const progress of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
        const copy = mark.cloneNode(true) as SVGSVGElement;
        [...copy.querySelectorAll(".brand-band")].forEach((band, index) => {
          band.setAttribute("fill", getComputedStyle(bands[index]).fill);
        });
        // The inline style is what the animation drives, and it beats a presentation attribute.
        (copy.querySelector(".brand-bands") as SVGGElement).style.transform = `translateX(${-397.795 * progress}px)`;
        copy.setAttribute("width", String(size));
        copy.setAttribute("height", String(size));

        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = reject;
          element.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
        });

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0, size, size);
        const data = context.getImageData(0, 0, size, size).data;

        // Sampled inside the rounded crop, so the corners it removes are not counted as holes.
        let transparent = 0;
        for (let y = 12; y < size - 12; y += 1) {
          for (let x = 12; x < size - 12; x += 1) {
            if (data[(y * size + x) * 4 + 3] < 250) transparent += 1;
          }
        }
        results.push({ at: progress, transparent });
      }
      return results;
    });

  transparency.forEach(({ at, transparent }) => {
    expect(transparent, `${transparent} bare pixels at ${Math.round(at * 100)}% through the slide`).toBe(0);
  });
});

test("a second press restarts the run rather than doing nothing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const brand = visibleBrand(page);
  await brand.click();
  await expect(brand).toHaveClass(/is-cycling/);
  await expect(brand).not.toHaveClass(/is-cycling/);

  await brand.click();
  await expect(brand).toHaveClass(/is-cycling/);
  await expect(brand).not.toHaveClass(/is-cycling/);
  expect(await bandFills(brand)).toEqual(BANDS);
});

test("the wordmark contains its own text as the rail collapses", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  await expect(page.locator(".sidebar")).toHaveCSS("overflow", "visible");
  await expect(page.locator(".brand--sidebar .brand-text")).toHaveCSS("overflow", "hidden");

  const textWidth = () => page.locator(".brand--sidebar .brand-text").evaluate((text: HTMLElement) => text.getBoundingClientRect().width);
  expect(await textWidth()).toBeGreaterThan(0);

  // And it closes to nothing of its own accord, rather than leaning on the clip to hide it.
  await page.locator(".sidebar-bottom button, .sidebar-actions button").first().click();
  await expect.poll(textWidth).toBe(0);
});

test("collapsed lower rail controls match the navigation buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/is-ready/);

  const toggle = page.locator(".sidebar-toggle");
  if ((await toggle.getAttribute("aria-label")) === "Collapse") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-label", "Expand");
  await page.waitForTimeout(300);

  const sizes = await page
    .locator(".sidebar .nav-item.is-active, .sidebar-actions .sidebar-toggle, .sidebar-actions [data-action='open-settings']")
    .evaluateAll((buttons: HTMLElement[]) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );

  expect(sizes.length).toBeGreaterThan(2);
  sizes.forEach((size) => expect(size).toEqual(sizes[0]));
});
