import { licenseText, licensesList, licensesStatus } from "./dom";
import { t } from "./i18n";
import { showToast } from "./ui/notifications";

type LicenseEntry = {
  name: string;
  version?: string;
  license?: string;
  repository?: string | null;
  licenseText?: string | null;
};

type LicensePayload = {
  generatedAt?: string;
  total?: number;
  licenses: LicenseEntry[];
};

let cachedLicenses: LicenseEntry[] | null = null;
let loadPromise: Promise<LicenseEntry[]> | null = null;
let cachedLicenseText: string | null = null;
let licensePromise: Promise<string> | null = null;

const setStatus = (message: string | null) => {
  if (!licensesStatus) {
    return;
  }
  if (!message) {
    licensesStatus.classList.add("is-hidden");
    licensesStatus.textContent = "";
    return;
  }
  licensesStatus.classList.remove("is-hidden");
  licensesStatus.textContent = message;
};

const loadLicenses = async () => {
  if (cachedLicenses) {
    return cachedLicenses;
  }
  if (!loadPromise) {
    const licensesUrl = new URL("licenses.json", document.baseURI).toString();
    loadPromise = fetch(licensesUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load licenses (${response.status})`);
        }
        return (await response.json()) as LicensePayload;
      })
      .then((payload) => {
        cachedLicenses = payload.licenses ?? [];
        return cachedLicenses;
      })
      .catch((error) => {
        cachedLicenses = [];
        throw error;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
};

const renderLicenseEntry = (entry: LicenseEntry) => {
  const article = document.createElement("article");
  article.className = "license-item";

  const header = document.createElement("div");
  header.className = "license-item-header";

  const name = document.createElement("span");
  name.className = "license-name";
  name.textContent = entry.name;

  const version = document.createElement("span");
  version.className = "license-version";
  version.textContent = entry.version ? `v${entry.version}` : t("license.versionUnknown");

  header.append(name, version);

  const meta = document.createElement("div");
  meta.className = "license-meta";

  const license = document.createElement("span");
  license.textContent = entry.license
    ? `${t("licenses.meta.license")}: ${entry.license}`
    : `${t("licenses.meta.license")}: ${t("licenses.meta.licenseUnknown")}`;
  meta.append(license);

  if (entry.repository) {
    const repo = document.createElement("span");
    repo.textContent = `${t("licenses.meta.repository")}: ${entry.repository}`;
    meta.append(repo);
  }

  const text = document.createElement("pre");
  text.className = "license-text";
  text.textContent = entry.licenseText?.trim() || t("license.textMissing");

  article.append(header, meta, text);
  return article;
};

const renderLicenses = (entries: LicenseEntry[]) => {
  if (!licensesList) {
    return;
  }
  licensesList.innerHTML = "";
  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => fragment.append(renderLicenseEntry(entry)));
  licensesList.append(fragment);
};

export const ensureLicensesLoaded = async () => {
  setStatus(t("licenses.loading"));
  try {
    const licenses = await loadLicenses();
    if (!licenses.length) {
      setStatus(t("licenses.none"));
      return;
    }
    renderLicenses(licenses);
    setStatus(t("licenses.loaded", { count: licenses.length }));
  } catch (error) {
    console.error(error);
    setStatus(t("licenses.failed"));
    showToast(t("licenses.unable"), "error");
  }
};

const loadLicense = async () => {
  if (cachedLicenseText) {
    return cachedLicenseText;
  }
  if (!licensePromise) {
    const licenseUrl = new URL("license.txt", document.baseURI).toString();
    licensePromise = fetch(licenseUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load LICENSE license (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        cachedLicenseText = text;
        return text;
      })
      .catch((error) => {
        cachedLicenseText = "";
        throw error;
      })
      .finally(() => {
        licensePromise = null;
      });
  }
  return licensePromise;
};

export const ensureLicenseLoaded = async () => {
  if (licenseText) {
    licenseText.textContent = "";
  }
  try {
    const text = await loadLicense();
    if (licenseText) {
      licenseText.textContent = text.trim() || t("license.textFailed");
    }
  } catch (error) {
    console.error(error);
    showToast(t("license.unable"), "error");
  }
};
