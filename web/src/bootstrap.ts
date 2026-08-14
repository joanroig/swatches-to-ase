import appShellMarkup from "./app/markup/app-shell.html?raw";
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

appRoot.innerHTML = `${loadingMarkup}\n${appShellMarkup}`;

const modalsSlot = appRoot.querySelector<HTMLElement>("[data-slot='modals']");
if (modalsSlot) {
  modalsSlot.insertAdjacentHTML("beforebegin", modalsMarkup);
  modalsSlot.remove();
} else {
  appRoot.insertAdjacentHTML("beforeend", modalsMarkup);
}

void import("./main.ts");
