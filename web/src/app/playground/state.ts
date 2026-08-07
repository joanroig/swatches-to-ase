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

type Persisted = {
  style: string;
  scene: string;
  swatches: Array<{ hex: string; name: string; locked: boolean }>;
};

export const playgroundState = {
  style: "analogous",
  scene: "blend",
  swatches: [] as PlaygroundSwatch[],
};

export const playgroundLimits = { min: MIN_COLORS, max: MAX_COLORS };

const toSwatch = (color: PaletteColor, locked = false): PlaygroundSwatch => ({ ...color, locked });

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
};

export const setPlaygroundStyle = (style: string) => {
  playgroundState.style = style;
  persistPlayground();
};

export const setPlaygroundScene = (scene: string) => {
  playgroundState.scene = scene;
  persistPlayground();
};

export const addPlaygroundSwatch = () => {
  if (playgroundState.swatches.length >= MAX_COLORS) {
    return false;
  }
  const [color] = generatePaletteColors(playgroundState.style, 1, resolveActiveNameFormat());
  playgroundState.swatches.push(toSwatch(color));
  persistPlayground();
  return true;
};

export const removePlaygroundSwatch = (id?: string) => {
  if (playgroundState.swatches.length <= MIN_COLORS) {
    return false;
  }
  playgroundState.swatches = id
    ? playgroundState.swatches.filter((swatch) => swatch.id !== id)
    : playgroundState.swatches.slice(0, -1);
  persistPlayground();
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
};

export const movePlaygroundSwatch = (fromIndex: number, toIndex: number) => {
  const { swatches } = playgroundState;
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= swatches.length) {
    return;
  }
  const [moved] = swatches.splice(fromIndex, 1);
  swatches.splice(Math.max(0, Math.min(toIndex, swatches.length)), 0, moved);
  persistPlayground();
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
  }
};
