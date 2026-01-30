import { log } from "../dom";
import type { LogTone } from "../types";

export const appendLog = (message: string, tone: LogTone = "info") => {
  if (!log) {
    return;
  }
  const item = document.createElement("div");
  item.className = `log-item ${tone}`;
  item.textContent = message;
  log.prepend(item);
};

let toastStack: HTMLDivElement | null = null;

const ensureToastStack = () => {
  if (toastStack) {
    return toastStack;
  }
  if (!document.body) {
    return null;
  }
  toastStack = document.createElement("div");
  toastStack.className = "toast-stack";
  toastStack.setAttribute("aria-live", "polite");
  toastStack.setAttribute("aria-atomic", "true");
  document.body.appendChild(toastStack);
  return toastStack;
};

export const showToast = (message: string, tone: LogTone = "info") => {
  const stack = ensureToastStack();
  if (!stack) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  stack.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => {
      toast.remove();
    }, 240);
  }, 2200);
};
