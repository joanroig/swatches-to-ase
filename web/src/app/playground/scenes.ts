import { contrastRatio } from "../color/contrast";
import { t } from "../i18n";
import { getContrastColor, hexToRgb } from "../utils/color";

/**
 * The playground's visualisers.
 *
 * Every scene is plain DOM styled from the palette — no canvas, no library. That keeps them
 * resolution-independent, themeable and cheap to re-render on every shuffle, and it means a scene
 * is just a function from a colour list to an element.
 */

export type SceneId = "blend" | "ui" | "poster" | "chart";

export const SCENE_IDS: SceneId[] = ["blend", "ui", "poster", "chart"];

export const isSceneId = (value: string): value is SceneId => (SCENE_IDS as string[]).includes(value);

/** Palettes are 2–10 long but scenes want a fixed number of roles, so indices wrap. */
const pick = (colors: string[], index: number) => colors[((index % colors.length) + colors.length) % colors.length];

const ink = (hex: string) => getContrastColor(hexToRgb(hex));

/**
 * The palette colour at `index` if it is readable on `background`, otherwise the next one that is.
 *
 * Analogous and monochrome palettes are the common case where a naive "colour N on colour 0"
 * mapping produces text that is technically coloured and practically invisible; falling through to
 * plain contrast ink is better than shipping an unreadable demo.
 */
const READABLE_RATIO = 2.6;

const readableOn = (colors: string[], background: string, index: number) => {
  const backgroundRgb = hexToRgb(background);
  for (let step = 0; step < colors.length; step += 1) {
    const candidate = pick(colors, index + step);
    if (contrastRatio(backgroundRgb, hexToRgb(candidate)) >= READABLE_RATIO) {
      return candidate;
    }
  }
  return ink(background);
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const buildBlend = (colors: string[]) => {
  const scene = element("div", "scene scene-blend");

  const mesh = element("div", "blend-mesh");
  // One soft radial per colour, laid out on a ring so no colour is ever hidden behind another.
  const layers = colors.map((hex, index) => {
    const angle = (index / colors.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(50 + Math.cos(angle) * 32);
    const y = Math.round(50 + Math.sin(angle) * 32);
    return `radial-gradient(circle at ${x}% ${y}%, ${hex} 0%, ${hex} 14%, ${hex}00 52%)`;
  });
  mesh.style.backgroundImage = layers.join(", ");
  mesh.style.backgroundColor = pick(colors, 0);
  scene.appendChild(mesh);

  const ramp = element("div", "blend-ramp");
  ramp.style.backgroundImage = `linear-gradient(90deg, ${colors.join(", ")})`;
  scene.appendChild(ramp);

  const stops = element("div", "blend-stops");
  colors.forEach((hex) => {
    const stop = element("div", "blend-stop");
    stop.style.background = hex;
    stop.style.color = ink(hex);
    stop.appendChild(element("span", "blend-stop-hex", hex.toUpperCase()));
    stops.appendChild(stop);
  });
  scene.appendChild(stops);

  return scene;
};

const buildUi = (colors: string[]) => {
  const surface = pick(colors, 0);
  const accent = pick(colors, 1);
  const secondary = pick(colors, 2);
  const tertiary = pick(colors, 3);

  const scene = element("div", "scene scene-ui");
  scene.style.background = surface;
  scene.style.color = ink(surface);

  const rail = element("div", "ui-rail");
  rail.style.background = accent;
  rail.style.color = ink(accent);
  rail.appendChild(element("div", "ui-logo"));
  ["", "", "", ""].forEach((_, index) => {
    const item = element("div", `ui-rail-item${index === 0 ? " is-active" : ""}`);
    rail.appendChild(item);
  });
  scene.appendChild(rail);

  const body = element("div", "ui-body");

  const header = element("div", "ui-header");
  header.appendChild(element("div", "ui-title", t("playground.scene.ui.title")));
  const cta = element("div", "ui-cta", t("playground.scene.ui.action"));
  cta.style.background = accent;
  cta.style.color = ink(accent);
  header.appendChild(cta);
  body.appendChild(header);

  const cards = element("div", "ui-cards");
  [accent, secondary, tertiary].forEach((hex, index) => {
    const card = element("div", "ui-card");
    card.style.background = hex;
    card.style.color = ink(hex);
    card.appendChild(element("span", "ui-card-value", ["64%", "1.2k", "18"][index] ?? "—"));
    card.appendChild(element("span", "ui-card-label", t(`playground.scene.ui.metric${index + 1}`)));
    cards.appendChild(card);
  });
  body.appendChild(cards);

  const panel = element("div", "ui-panel");
  panel.style.background = pick(colors, 4);
  panel.style.color = ink(pick(colors, 4));
  const bars = element("div", "ui-bars");
  [0.9, 0.55, 0.75, 0.35, 0.62, 0.48].forEach((height, index) => {
    const bar = element("div", "ui-bar");
    bar.style.height = `${Math.round(height * 100)}%`;
    bar.style.background = pick(colors, index + 1);
    bars.appendChild(bar);
  });
  panel.appendChild(bars);
  body.appendChild(panel);

  scene.appendChild(body);
  return scene;
};

const buildPoster = (colors: string[]) => {
  const background = pick(colors, 0);
  const scene = element("div", "scene scene-poster");
  scene.style.background = background;
  scene.style.color = ink(background);

  const shapes = element("div", "poster-shapes");
  colors.slice(0, 6).forEach((hex, index) => {
    const shape = element("div", `poster-shape poster-shape--${index % 3}`);
    shape.style.background = hex;
    shape.style.setProperty("--shape-index", String(index));
    shapes.appendChild(shape);
  });
  scene.appendChild(shapes);

  const copy = element("div", "poster-copy");
  const heading = element("h3", "poster-heading");
  // The heading is the palette itself: each word takes the colour it names.
  t("playground.scene.poster.heading")
    .split(" ")
    .forEach((word, index) => {
      const span = element("span", "poster-word", word);
      span.style.color = readableOn(colors, background, index + 1);
      heading.appendChild(span);
    });
  copy.appendChild(heading);
  copy.appendChild(element("p", "poster-lede", t("playground.scene.poster.lede")));

  const chips = element("div", "poster-chips");
  colors.forEach((hex) => {
    const chip = element("span", "poster-chip", hex.toUpperCase().replace("#", ""));
    chip.style.background = hex;
    chip.style.color = ink(hex);
    chips.appendChild(chip);
  });
  copy.appendChild(chips);

  scene.appendChild(copy);
  return scene;
};

const buildChart = (colors: string[]) => {
  const scene = element("div", "scene scene-chart");

  const donut = element("div", "chart-donut");
  // Equal slices: the point is to read the palette, not to plot real data.
  const slice = 360 / colors.length;
  const stops = colors.map((hex, index) => `${hex} ${index * slice}deg ${(index + 1) * slice}deg`);
  donut.style.backgroundImage = `conic-gradient(${stops.join(", ")})`;
  scene.appendChild(donut);

  const columns = element("div", "chart-columns");
  colors.forEach((hex, index) => {
    const column = element("div", "chart-column");
    const fill = element("div", "chart-fill");
    // A deterministic pseudo-random ramp: the same palette always draws the same chart.
    fill.style.height = `${30 + ((index * 37) % 65)}%`;
    fill.style.background = hex;
    column.appendChild(fill);
    column.appendChild(element("span", "chart-tick", hex.toUpperCase().replace("#", "")));
    columns.appendChild(column);
  });
  scene.appendChild(columns);

  const legend = element("div", "chart-legend");
  colors.forEach((hex, index) => {
    const row = element("div", "chart-legend-row");
    const dot = element("span", "chart-dot");
    dot.style.background = hex;
    row.appendChild(dot);
    row.appendChild(element("span", "chart-legend-label", t("playground.scene.chart.series", { index: index + 1 })));
    legend.appendChild(row);
  });
  scene.appendChild(legend);

  return scene;
};

const BUILDERS: Record<SceneId, (colors: string[]) => HTMLElement> = {
  blend: buildBlend,
  ui: buildUi,
  poster: buildPoster,
  chart: buildChart,
};

export const buildScene = (scene: SceneId, colors: string[]) => BUILDERS[scene](colors);
