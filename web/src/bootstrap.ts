import appShellMarkup from "./app/markup/app-shell.html?raw";
import loadingMarkup from "./app/markup/loading-screen.html?raw";
import modalsMarkup from "./app/markup/modals.html?raw";

const appRoot = document.querySelector<HTMLDivElement>("#app-root");

if (!appRoot) {
  throw new Error("Missing #app-root container in index.html");
}

appRoot.innerHTML = `${loadingMarkup}\n${appShellMarkup}`;

const modalsSlot = appRoot.querySelector<HTMLElement>("[data-slot='modals']");
if (modalsSlot) {
  modalsSlot.insertAdjacentHTML("beforebegin", modalsMarkup);
  modalsSlot.remove();
} else {
  appRoot.insertAdjacentHTML("beforeend", modalsMarkup);
}

void import("./main.ts");
