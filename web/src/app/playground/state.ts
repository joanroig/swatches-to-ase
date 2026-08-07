import { generatePaletteColors } from "../palette/generation";
import { resolveActiveNameFormat } from "../palette/format";
import { nameColor } from "../palette/naming";
import type { PaletteColor } from "../types";
import { getHueFromHex, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";

/**
 * The playground's working set.
 *
 * Deliberately separate from `state.palettes`: the playground is a scratch surface, and nothing
 * that happens here touches the library until "Save to library" is pressed. It persists to
 * localStorage only — a scratch pad is per-device by nature, and syncing it would mean a schema
 * migration in the Firestore rules for something nobody wants to see on another machine.
 */

export type PlaygroundSwatch = PaletteColor & { locked: boolean };

const STORAGE_KEY = "palette-studio.playground";
const MIN_COLORS = 2;
const MAX_COLORS = 10;
const DEFAULT_COUNT = 5;

const HISTORY_LIMIT = 40;

type StoredSwatch = { hex: string; name: string; locked: boolean };

export const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6, 2];

type Persisted = {
  style: string;
  scene: string;
  zoom: number;
  swatches: StoredSwatch[];
  sourcePaletteId: string | null;
  sourceName: string | null;
};

export const playgroundState = {
  style: "analogous",
  scene: "blend",
  /** Preview magnification, an index into `ZOOM_STEPS`. */
  zoom: 1,
  swatches: [] as PlaygroundSwatch[],
  /** The library palette this working set came from, if any. Drives "Update" vs "Save as new". */
  sourcePaletteId: null as string | null,
  sourceName: null as string | null,
};

export const playgroundLimits = { min: MIN_COLORS, max: MAX_COLORS };

const toSwatch = (color: PaletteColor, locked = false): PlaygroundSwatch => ({ ...color, locked });

/*
 * Undo/redo over the working set.
 *
 * Shuffling is destructive and the whole point is to keep pressing it, so without a way back the
 * one you liked two presses ago is gone. Snapshots are plain colour lists — small enough that
 * keeping forty of them costs nothing.
 */

type Snapshot = PlaygroundSwatch[];

let history: Snapshot[] = [];
let historyIndex = -1;

const snapshot = (): Snapshot =>
  playgroundState.swatches.map((swatch) => ({ ...swatch, rgb: [...swatch.rgb] as [number, number, number] }));

const restoreSnapshot = (entry: Snapshot) => {
  playgroundState.swatches = entry.map((swatch) => ({ ...swatch, rgb: [...swatch.rgb] as [number, number, number] }));
};

/** Record the current working set as an undo step. Call *after* a change lands. */
export const commitPlaygroundHistory = () => {
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot());
  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }
  historyIndex = history.length - 1;
};

export const canUndoPlayground = () => historyIndex > 0;
export const canRedoPlayground = () => historyIndex >= 0 && historyIndex < history.length - 1;

export const undoPlayground = () => {
  if (!canUndoPlayground()) {
    return false;
  }
  historyIndex -= 1;
  restoreSnapshot(history[historyIndex]);
  persistPlayground();
  return true;
};

export const redoPlayground = () => {
  if (!canRedoPlayground()) {
    return false;
  }
  historyIndex += 1;
  restoreSnapshot(history[historyIndex]);
  persistPlayground();
  return true;
};

/** Replace the working set with a library palette's colours and remember where it came from. */
export const loadPaletteIntoPlayground = (paletteId: string, name: string, colors: PaletteColor[]) => {
  playgroundState.swatches = colors
    .slice(0, MAX_COLORS)
    .map((color) => toSwatch({ ...color, id: createId(), rgb: [...color.rgb] as [number, number, number] }));
  playgroundState.sourcePaletteId = paletteId;
  playgroundState.sourceName = name;
  persistPlayground();
  commitPlaygroundHistory();
};

/** Forget the library link, so the next save creates a new palette. */
export const detachPlaygroundSource = () => {
  playgroundState.sourcePaletteId = null;
  playgroundState.sourceName = null;
  persistPlayground();
};

/**
 * Generate `count` colours in `style`, keeping every locked swatch exactly where it is.
 *
 * Locked swatches also seed the harmony: the first one becomes the base hue, so shuffling around a
 * colour you like produces variations of it rather than an unrelated palette every time.
 */
export const shufflePlayground = () => {
  const count = playgroundState.swatches.length || DEFAULT_COUNT;
  const locked = playgroundState.swatches.filter((swatch) => swatch.locked);
  const baseHue = locked.length > 0 ? getHueFromHex(rgbToHex(locked[0].rgb)) : undefined;
  const fresh = generatePaletteColors(playgroundState.style, count, resolveActiveNameFormat(), baseHue);

  playgroundState.swatches = Array.from({ length: count }, (_, index) => {
    const existing = playgroundState.swatches[index];
    return existing?.locked ? existing : toSwatch(fresh[index] ?? fresh[fresh.length - 1]);
  });
  persistPlayground();
  commitPlaygroundHistory();
};

export const setPlaygroundStyle = (style: string) => {
  playgroundState.style = style;
  persistPlayground();
};

export const setPlaygroundScene = (scene: string) => {
  playgroundState.scene = scene;
  persistPlayground();
};

/** Step the preview magnification. Returns false when already at the end of the range. */
export const stepPlaygroundZoom = (direction: 1 | -1) => {
  const current = ZOOM_STEPS.indexOf(playgroundState.zoom);
  const index = Math.max(0, Math.min((current < 0 ? ZOOM_STEPS.indexOf(1) : current) + direction, ZOOM_STEPS.length - 1));
  if (ZOOM_STEPS[index] === playgroundState.zoom) {
    return false;
  }
  playgroundState.zoom = ZOOM_STEPS[index];
  persistPlayground();
  return true;
};

export const canStepPlaygroundZoom = (direction: 1 | -1) => {
  const index = ZOOM_STEPS.indexOf(playgroundState.zoom);
  return direction < 0 ? index > 0 : index >= 0 && index < ZOOM_STEPS.length - 1;
};

/**
 * Insert a colour at `index`, blending its neighbours where it has two.
 *
 * A random colour dropped between two neighbours reads as a mistake; the midpoint of the pair
 * either side is what someone reaching for the "+" between two swatches actually means.
 */
export const insertPlaygroundSwatch = (index: number) => {
  if (playgroundState.swatches.length >= MAX_COLORS) {
    return false;
  }
  const at = Math.max(0, Math.min(index, playgroundState.swatches.length));
  const before = playgroundState.swatches[at - 1];
  const after = playgroundState.swatches[at];
  let rgb: [number, number, number];
  if (before && after) {
    rgb = [0, 1, 2].map((channel) => (before.rgb[channel] + after.rgb[channel]) / 2) as [number, number, number];
  } else {
    const [generated] = generatePaletteColors(playgroundState.style, 1, resolveActiveNameFormat());
    rgb = generated.rgb;
  }
  playgroundState.swatches.splice(at, 0, {
    id: createId(),
    name: nameColor(rgbToHex(rgb).toUpperCase(), resolveActiveNameFormat(), at),
    rgb,
    locked: false,
  });
  persistPlayground();
  commitPlaygroundHistory();
  return true;
};

export const removePlaygroundSwatch = (id?: string) => {
  if (playgroundState.swatches.length <= MIN_COLORS) {
    return false;
  }
  playgroundState.swatches = id ? playgroundState.swatches.filter((swatch) => swatch.id !== id) : playgroundState.swatches.slice(0, -1);
  persistPlayground();
  commitPlaygroundHistory();
  return true;
};

export const togglePlaygroundLock = (id: string) => {
  const swatch = playgroundState.swatches.find((entry) => entry.id === id);
  if (swatch) {
    swatch.locked = !swatch.locked;
    persistPlayground();
  }
};

export const setPlaygroundColor = (id: string, rgb: [number, number, number]) => {
  const swatch = playgroundState.swatches.find((entry) => entry.id === id);
  if (!swatch) {
    return;
  }
  swatch.rgb = rgb;
  swatch.name = nameColor(rgbToHex(rgb).toUpperCase(), resolveActiveNameFormat(), 0);
  persistPlayground();
  commitPlaygroundHistory();
};

export const movePlaygroundSwatch = (fromIndex: number, toIndex: number) => {
  const { swatches } = playgroundState;
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= swatches.length) {
    return;
  }
  const [moved] = swatches.splice(fromIndex, 1);
  swatches.splice(Math.max(0, Math.min(toIndex, swatches.length)), 0, moved);
  persistPlayground();
  commitPlaygroundHistory();
};

export const persistPlayground = () => {
  try {
    const payload: Persisted = {
      style: playgroundState.style,
      scene: playgroundState.scene,
      swatches: playgroundState.swatches.map((swatch) => ({
        hex: rgbToHex(swatch.rgb).toUpperCase(),
        name: swatch.name,
        locked: swatch.locked,
      })),
      zoom: playgroundState.zoom,
      sourcePaletteId: playgroundState.sourcePaletteId,
      sourceName: playgroundState.sourceName,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable (private mode, quota). The playground still works in memory.
  }
};

const parseHex = (hex: string): [number, number, number] | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

export const restorePlayground = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
    if (stored?.style) {
      playgroundState.style = stored.style;
    }
    if (stored?.scene) {
      playgroundState.scene = stored.scene;
    }
    playgroundState.zoom = ZOOM_STEPS.includes(Number(stored?.zoom)) ? Number(stored?.zoom) : 1;
    playgroundState.sourcePaletteId = stored?.sourcePaletteId ?? null;
    playgroundState.sourceName = stored?.sourceName ?? null;
    const swatches = Array.isArray(stored?.swatches) ? stored.swatches : [];
    playgroundState.swatches = swatches
      .map((entry) => {
        const rgb = parseHex(String(entry?.hex ?? ""));
        return rgb ? { id: createId(), name: String(entry?.name ?? ""), rgb, locked: Boolean(entry?.locked) } : null;
      })
      .filter((swatch): swatch is PlaygroundSwatch => swatch !== null)
      .slice(0, MAX_COLORS);
  } catch {
    playgroundState.swatches = [];
  }
  if (playgroundState.swatches.length < MIN_COLORS) {
    playgroundState.swatches = [];
    shufflePlayground();
    return;
  }
  commitPlaygroundHistory();
};
