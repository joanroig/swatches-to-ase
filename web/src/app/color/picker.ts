import convert from "color-convert";

import { clamp } from "../utils/math";
import { getRgb255, hexToRgb, rgbToHex } from "../utils/color";

/**
 * A saturation/value area plus a hue slider, the standard two-control picker.
 *
 * HSV is held as the source of truth rather than being re-derived from RGB on every frame: at the
 * top and bottom edges of the area many HSV values map to the same RGB, so round-tripping would
 * make the handle jump as you dragged along them.
 */
export type PickerColor = { h: number; s: number; v: number };

export const rgbToHsv = (rgb: [number, number, number]): PickerColor => {
  const [r, g, b] = getRgb255(rgb);
  const [h, s, v] = convert.rgb.hsv(r, g, b);
  return { h, s, v };
};

export const hsvToRgb = ({ h, s, v }: PickerColor): [number, number, number] => {
  const [r, g, b] = convert.hsv.rgb([h, s, v]);
  return [r / 255, g / 255, b / 255];
};

export const hsvToHex = (hsv: PickerColor) => rgbToHex(hsvToRgb(hsv)).toUpperCase();

type PickerOptions = {
  onChange: (hsv: PickerColor) => void;
  /** Fired when a drag finishes, so callers can commit an undo step. */
  onCommit: () => void;
};

/** Track a pointer over an element, reporting its position as 0..1 on each axis. */
const trackPointer = (
  element: HTMLElement,
  onMove: (x: number, y: number) => void,
  onCommit: () => void,
) => {
  let pointerId: number | null = null;

  const report = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    onMove(
      rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0,
      rect.height > 0 ? clamp((event.clientY - rect.top) / rect.height, 0, 1) : 0,
    );
  };

  const handleMove = (event: PointerEvent) => {
    if (pointerId === event.pointerId) {
      event.preventDefault();
      report(event);
    }
  };

  const handleUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) {
      return;
    }
    pointerId = null;
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
    onCommit();
  };

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    pointerId = event.pointerId;
    element.focus();
    report(event);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  });
};

export const createColorPicker = ({ onChange, onCommit }: PickerOptions) => {
  let current: PickerColor = { h: 0, s: 100, v: 100 };

  const root = document.createElement("div");
  root.className = "picker";

  const area = document.createElement("div");
  area.className = "picker-area";
  area.tabIndex = 0;
  area.setAttribute("role", "slider");
  area.setAttribute("aria-label", "Saturation and brightness");
  const areaHandle = document.createElement("span");
  areaHandle.className = "picker-handle";
  area.appendChild(areaHandle);

  const hue = document.createElement("div");
  hue.className = "picker-hue";
  hue.tabIndex = 0;
  hue.setAttribute("role", "slider");
  hue.setAttribute("aria-label", "Hue");
  hue.setAttribute("aria-valuemin", "0");
  hue.setAttribute("aria-valuemax", "359");
  const hueHandle = document.createElement("span");
  hueHandle.className = "picker-handle picker-handle--hue";
  hue.appendChild(hueHandle);

  root.append(area, hue);

  const render = () => {
    area.style.setProperty("--picker-hue", `hsl(${current.h}, 100%, 50%)`);
    areaHandle.style.left = `${current.s}%`;
    areaHandle.style.top = `${100 - current.v}%`;
    areaHandle.style.background = hsvToHex(current);
    hueHandle.style.left = `${(current.h / 360) * 100}%`;
    hueHandle.style.background = `hsl(${current.h}, 100%, 50%)`;
    hue.setAttribute("aria-valuenow", String(Math.round(current.h)));
    area.setAttribute("aria-valuetext", `${Math.round(current.s)}% saturation, ${Math.round(current.v)}% brightness`);
  };

  const update = (next: Partial<PickerColor>) => {
    current = { ...current, ...next };
    render();
    onChange(current);
  };

  trackPointer(
    area,
    (x, y) => update({ s: x * 100, v: (1 - y) * 100 }),
    onCommit,
  );
  trackPointer(
    hue,
    (x) => update({ h: x * 359.99 }),
    onCommit,
  );

  const nudge = (event: KeyboardEvent, apply: (step: number, axis: "x" | "y") => void) => {
    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowLeft":
        apply(-step, "x");
        break;
      case "ArrowRight":
        apply(step, "x");
        break;
      case "ArrowUp":
        apply(step, "y");
        break;
      case "ArrowDown":
        apply(-step, "y");
        break;
      default:
        return;
    }
    event.preventDefault();
    onCommit();
  };

  area.addEventListener("keydown", (event) =>
    nudge(event, (step, axis) => {
      if (axis === "x") {
        update({ s: clamp(current.s + step, 0, 100) });
      } else {
        update({ v: clamp(current.v + step, 0, 100) });
      }
    }),
  );
  hue.addEventListener("keydown", (event) =>
    nudge(event, (step, axis) => {
      if (axis === "x") {
        update({ h: (current.h + step + 360) % 360 });
      }
    }),
  );

  return {
    element: root,
    setColor: (rgb: [number, number, number]) => {
      current = rgbToHsv(rgb);
      render();
    },
    setHex: (hex: string) => {
      current = rgbToHsv(hexToRgb(hex));
      render();
    },
    getColor: () => current,
  };
};
