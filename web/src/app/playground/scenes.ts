import { contrastRatio } from "../color/contrast";
import { t } from "../i18n";
import { getContrastColor, hexToRgb } from "../utils/color";

/**
 * The playground's visualisers.
 *
 * Every scene is plain DOM styled from the palette — no canvas, no library. That keeps them
 * resolution-independent, themeable and cheap to re-render on every shuffle, and it means a scene
 * is just a function from a color list to an element.
 */

export type SceneId = "blend" | "ui" | "poster" | "chart";

export const SCENE_IDS: SceneId[] = ["blend", "ui", "poster", "chart"];

export const isSceneId = (value: string): value is SceneId => (SCENE_IDS as string[]).includes(value);

/** Palettes are 2–10 long but scenes want a fixed number of roles, so indices wrap. */
const pick = (colors: string[], index: number) => colors[((index % colors.length) + colors.length) % colors.length];

const ink = (hex: string) => getContrastColor(hexToRgb(hex));

/**
 * The palette color at `index` if it is readable on `background`, otherwise the next one that is.
 *
 * Analogous and monochrome palettes are the common case where a naive "color N on color 0"
 * mapping produces text that is technically colored and practically invisible; falling through to
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

/** A color at partial opacity, for hairlines and tints that must work on any background. */
const withAlpha = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${alpha})`;
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
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
  // One soft radial per color, laid out on a ring so no color is ever hidden behind another.
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

/**
 * A product dashboard.
 *
 * The palette is mapped to interface *roles* rather than to slots in order — a surface, a primary,
 * a pair of supporting accents — because that is how a palette actually gets used, and it is what
 * makes an unusable combination obvious at a glance. Text colors are picked by contrast against
 * whatever they sit on, never by index.
 */
const buildUi = (colors: string[]) => {
  const surface = pick(colors, 0);
  const primary = pick(colors, 1);
  const support = pick(colors, 2);
  const highlight = pick(colors, 3);
  const surfaceInk = ink(surface);

  const scene = element("div", "scene scene-ui");
  scene.style.background = surface;
  scene.style.color = surfaceInk;

  /* -- rail -- */
  const rail = element("div", "ui-rail");
  rail.style.background = primary;
  rail.style.color = ink(primary);

  const brand = element("div", "ui-brand");
  brand.appendChild(element("span", "ui-brand-mark"));
  brand.appendChild(element("span", "ui-brand-name", t("playground.scene.ui.brand")));
  rail.appendChild(brand);

  const nav = element("div", "ui-nav");
  [1, 2, 3, 4].forEach((slot, index) => {
    const item = element("div", `ui-nav-item${index === 0 ? " is-active" : ""}`);
    item.appendChild(element("span", "ui-nav-dot"));
    item.appendChild(element("span", "ui-nav-label", t(`playground.scene.ui.nav${slot}`)));
    nav.appendChild(item);
  });
  rail.appendChild(nav);

  const promo = element("div", "ui-promo");
  promo.style.background = highlight;
  promo.style.color = ink(highlight);
  promo.appendChild(element("span", "ui-promo-title", t("playground.scene.ui.promoTitle")));
  promo.appendChild(element("span", "ui-promo-body", t("playground.scene.ui.promoBody")));
  rail.appendChild(promo);

  scene.appendChild(rail);

  /* -- body -- */
  const body = element("div", "ui-body");

  const header = element("div", "ui-header");
  const heading = element("div", "ui-heading");
  heading.appendChild(element("h3", "ui-title", t("playground.scene.ui.title")));
  heading.appendChild(element("p", "ui-subtitle", t("playground.scene.ui.subtitle")));
  header.appendChild(heading);

  const cta = element("button", "ui-cta", t("playground.scene.ui.action"));
  cta.type = "button";
  cta.tabIndex = -1;
  cta.style.background = primary;
  cta.style.color = ink(primary);
  header.appendChild(cta);
  body.appendChild(header);

  const cards = element("div", "ui-cards");
  const METRICS = [
    { value: "64%", delta: "+12%", tone: primary },
    { value: "1,248", delta: "+7%", tone: support },
    { value: "18", delta: "-3", tone: highlight },
  ];
  METRICS.forEach((metric, index) => {
    const card = element("div", "ui-card");
    card.style.background = metric.tone;
    card.style.color = ink(metric.tone);
    const top = element("div", "ui-card-top");
    top.appendChild(element("span", "ui-card-label", t(`playground.scene.ui.metric${index + 1}`)));
    top.appendChild(element("span", "ui-card-delta", metric.delta));
    card.appendChild(top);
    card.appendChild(element("span", "ui-card-value", metric.value));
    // A filled track reading as a share of the whole, drawn in the card's own ink so it works on
    // any tone the palette happens to supply.
    const track = element("div", "ui-card-track");
    const fill = element("div", "ui-card-fill");
    fill.style.width = ["64%", "78%", "35%"][index];
    track.appendChild(fill);
    card.appendChild(track);
    cards.appendChild(card);
  });
  body.appendChild(cards);

  /* -- chart panel -- */
  const panel = element("div", "ui-panel");
  panel.style.borderColor = withAlpha(surfaceInk, 0.16);

  const panelHead = element("div", "ui-panel-head");
  panelHead.appendChild(element("span", "ui-panel-title", t("playground.scene.ui.chartTitle")));
  const legend = element("div", "ui-panel-legend");
  [primary, support].forEach((tone, index) => {
    const entry = element("span", "ui-legend-entry");
    const dot = element("span", "ui-legend-dot");
    dot.style.background = tone;
    entry.appendChild(dot);
    entry.appendChild(element("span", "ui-legend-text", t(`playground.scene.ui.series${index + 1}`)));
    legend.appendChild(entry);
  });
  panelHead.appendChild(legend);
  panel.appendChild(panelHead);

  const plot = element("div", "ui-plot");
  // Gridlines behind the bars: without a baseline to sit on, the columns read as loose floating
  // rectangles rather than as a chart.
  const grid = element("div", "ui-grid");
  [0, 1, 2, 3].forEach(() => {
    const line = element("div", "ui-gridline");
    line.style.background = withAlpha(surfaceInk, 0.12);
    grid.appendChild(line);
  });
  plot.appendChild(grid);

  const bars = element("div", "ui-bars");
  const HEIGHTS = [46, 62, 38, 84, 55, 71, 44];
  HEIGHTS.forEach((height, index) => {
    const slot = element("div", "ui-bar-slot");
    const stack = element("div", "ui-bar-stack");
    const lower = element("div", "ui-bar ui-bar--lower");
    lower.style.height = `${Math.round(height * 0.62)}%`;
    lower.style.background = primary;
    const upper = element("div", "ui-bar ui-bar--upper");
    upper.style.height = `${Math.round(height * 0.38)}%`;
    upper.style.background = support;
    stack.append(upper, lower);
    slot.appendChild(stack);
    const tick = element("span", "ui-bar-tick", t(`playground.scene.ui.day${(index % 7) + 1}`));
    tick.style.color = withAlpha(surfaceInk, 0.6);
    slot.appendChild(tick);
    bars.appendChild(slot);
  });
  plot.appendChild(bars);
  panel.appendChild(plot);
  body.appendChild(panel);

  /* -- list -- */
  const list = element("div", "ui-list");
  list.style.borderColor = withAlpha(surfaceInk, 0.16);
  [primary, support, highlight].forEach((tone, index) => {
    const row = element("div", "ui-list-row");
    row.style.borderColor = withAlpha(surfaceInk, 0.1);
    const avatar = element("span", "ui-avatar");
    avatar.style.background = tone;
    avatar.style.color = ink(tone);
    avatar.textContent = t(`playground.scene.ui.row${index + 1}`)
      .slice(0, 1)
      .toUpperCase();
    row.appendChild(avatar);
    const text = element("div", "ui-list-text");
    text.appendChild(element("span", "ui-list-name", t(`playground.scene.ui.row${index + 1}`)));
    const meta = element("span", "ui-list-meta", t(`playground.scene.ui.rowMeta${index + 1}`));
    meta.style.color = withAlpha(surfaceInk, 0.6);
    text.appendChild(meta);
    row.appendChild(text);
    const pill = element("span", "ui-pill", t(`playground.scene.ui.status${index + 1}`));
    pill.style.background = withAlpha(tone, 0.24);
    pill.style.color = readableOn(colors, surface, index + 1);
    row.appendChild(pill);
    list.appendChild(row);
  });
  body.appendChild(list);

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
  // The heading is the palette itself: each word takes the color it names.
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

/**
 * A small chart set: a donut with a centre readout, a gridded column chart and a stacked bar.
 *
 * Equal slices and a fixed height ramp on purpose — this is a color test, not a data viz, and the
 * same palette must always draw the same chart so two shuffles can be compared.
 */
const buildChart = (colors: string[]) => {
  const scene = element("div", "scene scene-chart");

  const donutCard = element("div", "chart-card chart-card--donut");
  donutCard.appendChild(element("span", "chart-card-title", t("playground.scene.chart.share")));
  const donutWrap = element("div", "chart-donut-wrap");
  const donut = element("div", "chart-donut");
  const slice = 360 / colors.length;
  const stops = colors.map((hex, index) => `${hex} ${index * slice}deg ${(index + 1) * slice}deg`);
  donut.style.backgroundImage = `conic-gradient(${stops.join(", ")})`;
  donutWrap.appendChild(donut);
  const centre = element("div", "chart-donut-centre");
  centre.appendChild(element("span", "chart-donut-value", String(colors.length)));
  centre.appendChild(element("span", "chart-donut-label", t("playground.scene.chart.colors")));
  donutWrap.appendChild(centre);
  donutCard.appendChild(donutWrap);
  scene.appendChild(donutCard);

  const barCard = element("div", "chart-card chart-card--bars");
  barCard.appendChild(element("span", "chart-card-title", t("playground.scene.chart.byColor")));
  const plot = element("div", "chart-plot");
  const grid = element("div", "chart-grid");
  [0, 1, 2, 3, 4].forEach(() => grid.appendChild(element("div", "chart-gridline")));
  plot.appendChild(grid);
  const columns = element("div", "chart-columns");
  colors.forEach((hex, index) => {
    const column = element("div", "chart-column");
    const fill = element("div", "chart-fill");
    // Deterministic pseudo-random ramp: the same palette always draws the same chart.
    fill.style.height = `${30 + ((index * 37) % 65)}%`;
    fill.style.background = hex;
    column.appendChild(fill);
    column.appendChild(element("span", "chart-tick", hex.toUpperCase().replace("#", "")));
    columns.appendChild(column);
  });
  plot.appendChild(columns);
  barCard.appendChild(plot);
  scene.appendChild(barCard);

  const stackCard = element("div", "chart-card chart-card--stack");
  stackCard.appendChild(element("span", "chart-card-title", t("playground.scene.chart.mix")));
  const stack = element("div", "chart-stack");
  colors.forEach((hex, index) => {
    const segment = element("div", "chart-stack-segment");
    segment.style.background = hex;
    segment.style.flexGrow = String(1 + ((index * 3) % 4));
    stack.appendChild(segment);
  });
  stackCard.appendChild(stack);

  const legend = element("div", "chart-legend");
  colors.forEach((hex, index) => {
    const row = element("div", "chart-legend-row");
    const dot = element("span", "chart-dot");
    dot.style.background = hex;
    row.appendChild(dot);
    row.appendChild(element("span", "chart-legend-label", t("playground.scene.chart.series", { index: index + 1 })));
    row.appendChild(element("span", "chart-legend-value", hex.toUpperCase().replace("#", "")));
    legend.appendChild(row);
  });
  stackCard.appendChild(legend);
  scene.appendChild(stackCard);

  return scene;
};

const BUILDERS: Record<SceneId, (colors: string[]) => HTMLElement> = {
  blend: buildBlend,
  ui: buildUi,
  poster: buildPoster,
  chart: buildChart,
};

export const buildScene = (scene: SceneId, colors: string[]) => BUILDERS[scene](colors);
