import fs from "node:fs";
import { spawnSync } from "node:child_process";
import playwright from "playwright";

const { chromium } = playwright;
const executablePath = chromium.executablePath();

if (executablePath && fs.existsSync(executablePath)) {
  process.exit(0);
}

const args = ["playwright", "install", "chromium"];
if (process.platform === "linux") {
  args.push("--with-deps");
}

const result = spawnSync("npx", args, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
