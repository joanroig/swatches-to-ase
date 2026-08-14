/*
 * A temporary instrument for the signed-in reload, off unless you ask for it with `?debug=render`.
 *
 * The flickering only reproduces with a cloud session, which cannot be driven from a test, so this
 * records what the page actually did: every icon that was thrown away and rebuilt, every avatar
 * that reloaded, every animation that ran, and where each happened relative to the app becoming
 * visible. `__renderTrace()` in the console prints the summary.
 */
type Entry = { at: number; kind: string; detail: string };

const entries: Entry[] = [];
const stamp = () => Math.round(performance.now());

/** The nearest thing with a name, so a line in the log says which part of the screen moved. */
const describe = (node: Node) => {
  let element: Element | null = node instanceof Element ? node : node.parentElement;
  while (element) {
    const id = element.id;
    if (id) {
      return `#${id}`;
    }
    const section = element.closest<HTMLElement>("[data-view-section]");
    if (section) {
      return `${element.className?.toString().split(" ")[0] || element.tagName.toLowerCase()} in ${section.dataset.viewSection}`;
    }
    element = element.parentElement;
  }
  return "detached";
};

export const startRenderTrace = () => {
  if (new URLSearchParams(window.location.search).get("debug") !== "render") {
    return;
  }

  const push = (kind: string, detail: string) => entries.push({ at: stamp(), kind, detail });

  const install = () => {
    const icons = new MutationObserver((records) => {
      const removed: string[] = [];
      const added: string[] = [];
      records.forEach((record) => {
        record.removedNodes.forEach((node) => {
          if (node instanceof SVGElement && node.classList.contains("icon")) removed.push(describe(record.target));
        });
        record.addedNodes.forEach((node) => {
          if (node instanceof SVGElement && node.classList.contains("icon")) added.push(describe(record.target));
        });
      });
      if (removed.length || added.length) {
        push("icons", `-${removed.length} +${added.length} :: ${[...new Set([...removed, ...added])].slice(0, 6).join(", ")}`);
      }
    });
    icons.observe(document.body, { childList: true, subtree: true });

    document.addEventListener(
      "load",
      (event) => {
        const target = event.target;
        if (target instanceof HTMLImageElement) {
          push("image", `${target.className || target.tagName} <- ${target.getAttribute("src")?.slice(0, 40)}`);
        }
      },
      true,
    );

    document.addEventListener(
      "animationstart",
      (event) => {
        const name = (event as AnimationEvent).animationName;
        if (name !== "loading-spin") {
          push("animation", `${name} on ${describe(event.target as Node)}`);
        }
      },
      true,
    );

    const ready = new MutationObserver(() => {
      if (document.body.classList.contains("is-ready")) {
        push("reveal", "app becomes visible");
        ready.disconnect();
      }
    });
    ready.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  };

  if (document.body) {
    install();
  } else {
    document.addEventListener("DOMContentLoaded", install);
  }

  (window as unknown as { __renderTrace: () => Entry[] }).__renderTrace = () => {
    console.table(entries);
    return entries;
  };
  console.info("[render-trace] recording. Reload signed in, wait a few seconds, then run __renderTrace()");
};
