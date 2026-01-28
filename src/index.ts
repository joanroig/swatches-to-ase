import { ColorConverter } from "./services/convert.js";

const cc = new ColorConverter();
cc.start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
