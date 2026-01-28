import fs from "fs";

import { ColorConverter } from "./services/convert.js";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
) as { version?: string; build?: { productName?: string }; name?: string };
const appVersion = packageJson.version ?? "0.0.0";
const appName =
  packageJson.build?.productName ?? packageJson.name ?? "Swatches to ASE";

console.info(`${appName} v${appVersion}`);

const cc = new ColorConverter();
cc.start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
