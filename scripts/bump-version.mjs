#!/usr/bin/env node
import fs from "node:fs";

const bump = process.argv[2];
const allowed = new Set(["major", "minor", "patch", "none"]);

if (!allowed.has(bump)) {
  console.error("Usage: node scripts/bump-version.mjs <major|minor|patch|none>");
  process.exit(1);
}

const pkgPath = new URL("../package.json", import.meta.url);
const lockPath = new URL("../package-lock.json", import.meta.url);

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const current = pkg.version;

const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

const formatVersion = ({ major, minor, patch }) =>
  `${major}.${minor}.${patch}`;

let next = current;

if (bump !== "none") {
  const version = parseVersion(current);

  if (bump === "major") {
    version.major += 1;
    version.minor = 0;
    version.patch = 0;
  } else if (bump === "minor") {
    version.minor += 1;
    version.patch = 0;
  } else if (bump === "patch") {
    version.patch += 1;
  }

  next = formatVersion(version);
  pkg.version = next;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    lock.version = next;
    if (lock.packages && lock.packages[""]) {
      lock.packages[""].version = next;
    }
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  }
}

process.stdout.write(`${next}\n`);
