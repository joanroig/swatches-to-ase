import appShellMarkup from "./app/markup/app-shell.html?raw";
import brandMarkMarkup from "./app/markup/brand-mark.html?raw";
import loadingMarkup from "./app/markup/loading-screen.html?raw";
// The modals were one 890-line file. Split by what they are for, not alphabetically, so a change
// to (say) the export flow touches one partial instead of scrolling past nine unrelated dialogs.
import accountModalsMarkup from "./app/markup/modals/account.html?raw";
import legalModalsMarkup from "./app/markup/modals/legal.html?raw";
import workflowModalsMarkup from "./app/markup/modals/workflow.html?raw";
import { mountIconSprite } from "./app/ui/icons";

const modalsMarkup = [workflowModalsMarkup, accountModalsMarkup, legalModalsMarkup].join("\n");

const appRoot = document.querySelector<HTMLDivElement>("#app-root");

if (!appRoot) {
  throw new Error("Missing #app-root container in index.html");
}

// Before the markup, so the `<use href="#icon-…">` tags inside it resolve on their first paint.
mountIconSprite();

// The splash, the topbar and the sidebar all wear the mark. Stamped from one partial rather than
// written out three times, so the artwork has a single place to be edited — and so the splash
// cannot be showing a differently shaped logo for the second before the app arrives. Each copy
// takes its own id, since the bands are referenced by `<use>` and a document cannot repeat an id.
let brandMarks = 0;
const withBrandMark = (markup: string) =>
  markup.replace(/<!-- brand-mark -->/g, () => {
    brandMarks += 1;
    return brandMarkMarkup.split("__BRAND_ID__").join(`brand-bands-${brandMarks}`);
  });

appRoot.innerHTML = `${withBrandMark(loadingMarkup)}\n${withBrandMark(appShellMarkup)}`;

const modalsSlot = appRoot.querySelector<HTMLElement>("[data-slot='modals']");
if (modalsSlot) {
  modalsSlot.insertAdjacentHTML("beforebegin", modalsMarkup);
  modalsSlot.remove();
} else {
  appRoot.insertAdjacentHTML("beforeend", modalsMarkup);
}

void import("./main.ts");
