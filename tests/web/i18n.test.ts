import assert from "node:assert/strict";
import { test } from "node:test";

import { getTranslationReport } from "../../web/src/app/i18n.ts";

test("translations stay in sync across languages", () => {
  const report = getTranslationReport();
  assert.equal(report.baseLanguage, "en");
  assert.deepEqual(report.missing, {});
  assert.deepEqual(report.extra, {});
});
