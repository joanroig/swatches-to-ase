const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? import.meta.env.VITE_FIREBASE_APP_CHECK_KEY ?? "";
const recaptchaDisabled = import.meta.env.VITE_DISABLE_RECAPTCHA === "true" || import.meta.env.VITE_DISABLE_RECAPTCHA === "1";

const recaptchaAction = "LOGIN";

let widgetId: number | null = null;
let token: string | null = null;
let scriptPromise: Promise<void> | null = null;
let loadFailed = false;

const isSupportedOrigin = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.protocol === "https:" || window.location.hostname === "localhost";
};

const loadRecaptchaScript = () => {
  if (scriptPromise) {
    return scriptPromise;
  }
  if (window.grecaptcha?.enterprise) {
    scriptPromise = Promise.resolve();
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/enterprise.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA enterprise script"));
    document.head.appendChild(script);
  }).catch((error) => {
    loadFailed = true;
    console.warn(error);
    throw error;
  });
  return scriptPromise;
};

export const isRecaptchaEnabled = () => !recaptchaDisabled && Boolean(recaptchaSiteKey) && isSupportedOrigin();

export const hasRecaptchaLoadFailed = () => loadFailed;

export const setupRecaptcha = async (container: HTMLElement | null) => {
  if (!container) {
    return;
  }
  if (!isRecaptchaEnabled()) {
    container.classList.add("is-hidden");
    return;
  }
  container.classList.remove("is-hidden");
  if (widgetId !== null) {
    return;
  }
  try {
    await loadRecaptchaScript();
  } catch {
    container.classList.add("is-hidden");
    return;
  }
  const enterprise = window.grecaptcha?.enterprise;
  if (!enterprise) {
    loadFailed = true;
    container.classList.add("is-hidden");
    return;
  }
  await new Promise<void>((resolve) => {
    enterprise.ready(() => {
      if (widgetId !== null) {
        resolve();
        return;
      }
      widgetId = enterprise.render(container, {
        sitekey: recaptchaSiteKey,
        action: recaptchaAction,
        callback: (nextToken: string) => {
          token = nextToken;
        },
        "expired-callback": () => {
          token = null;
        },
        "error-callback": () => {
          token = null;
        },
      });
      resolve();
    });
  });
};

export const getRecaptchaToken = () => {
  if (widgetId !== null && window.grecaptcha?.enterprise) {
    const response = window.grecaptcha.enterprise.getResponse(widgetId);
    if (response) {
      token = response;
    }
  }
  return token;
};

export const resetRecaptcha = () => {
  token = null;
  if (widgetId !== null && window.grecaptcha?.enterprise) {
    window.grecaptcha.enterprise.reset(widgetId);
  }
};
