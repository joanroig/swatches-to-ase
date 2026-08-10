import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const lockPath = path.join(rootDir, "package-lock.json");
const outputPath = path.join(rootDir, "web", "public", "licenses.json");
const licenseOutputPath = path.join(rootDir, "web", "public", "license.txt");
const projectLicensePath = path.join(rootDir, "LICENSE");

const preferredLicenseFiles = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
  "NOTICE",
  "NOTICE.md",
  "NOTICE.txt",
  "UNLICENSE",
  "UNLICENSE.md",
  "UNLICENSE.txt",
  "COPYRIGHT",
  "COPYRIGHT.md",
  "COPYRIGHT.txt",
];

const normalizeLicenseValue = (value) => {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeLicenseValue).filter(Boolean);
    return normalized.length ? normalized.join(" OR ") : null;
  }
  if (typeof value === "object") {
    return value.type ?? value.name ?? null;
  }
  return String(value);
};

const normalizeRepository = (value) => {
  if (!value) {
    return null;
  }
  const url = typeof value === "string" ? value : value.url;
  if (!url) {
    return null;
  }
  return url.replace(/^git\+/, "").replace(/\.git(#.*)?$/, "");
};

const inferNameFromPath = (packagePath) => {
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }
  const remainder = packagePath.slice(index + marker.length);
  const parts = remainder.split("/");
  if (!parts.length) {
    return null;
  }
  if (parts[0].startsWith("@") && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
};

const safeReadJson = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const findLicenseFile = async (packageDir) => {
  let entries;
  try {
    entries = await fs.readdir(packageDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  for (const name of preferredLicenseFiles) {
    if (files.includes(name)) {
      return path.join(packageDir, name);
    }
  }

  const fallback = files.find((name) => /^(licen[cs]e|copying|notice|unlicense|copyright)/i.test(name));
  return fallback ? path.join(packageDir, fallback) : null;
};

const readLicenseText = async (packageDir) => {
  const licenseFile = await findLicenseFile(packageDir);
  if (!licenseFile) {
    return null;
  }
  try {
    return await fs.readFile(licenseFile, "utf8");
  } catch {
    return null;
  }
};

const loadLockFile = async () => {
  const raw = await fs.readFile(lockPath, "utf8");
  return JSON.parse(raw);
};

const main = async () => {
  const lock = await loadLockFile();
  const packages = lock.packages ?? {};
  const licenses = [];
  const seen = new Set();

  for (const [pkgPath, info] of Object.entries(packages)) {
    if (!pkgPath) {
      continue;
    }
    if (info?.dev) {
      continue;
    }

    const name = info?.name ?? inferNameFromPath(pkgPath);
    if (!name) {
      continue;
    }

    const version = info?.version ?? "unknown";
    const key = `${name}@${version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const packageDir = path.resolve(rootDir, pkgPath);
    const packageJson = await safeReadJson(path.join(packageDir, "package.json"));
    const license =
      normalizeLicenseValue(info?.license) ??
      normalizeLicenseValue(info?.licenses) ??
      normalizeLicenseValue(packageJson?.license) ??
      normalizeLicenseValue(packageJson?.licenses) ??
      "UNKNOWN";
    const repository =
      normalizeRepository(info?.repository) ?? normalizeRepository(packageJson?.repository) ?? packageJson?.homepage ?? null;
    const licenseText = await readLicenseText(packageDir);

    licenses.push({
      name,
      version,
      license,
      repository,
      licenseText,
    });
  }

  licenses.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    generatedAt: new Date().toISOString(),
    total: licenses.length,
    licenses,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    const licenseText = await fs.readFile(projectLicensePath, "utf8");
    await fs.writeFile(licenseOutputPath, licenseText, "utf8");
  } catch (error) {
    console.warn("Unable to copy project license:", error);
  }
  console.log(`Generated ${licenses.length} licenses -> ${outputPath}`);
};

main().catch((error) => {
  console.error("Failed to build licenses:", error);
  process.exitCode = 1;
});
