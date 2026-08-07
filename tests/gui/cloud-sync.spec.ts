import fs from "node:fs";
import path from "node:path";

import playwright from "@playwright/test";

const { expect, test } = playwright;

const resetStorage = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
};

const readEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return {} as Record<string, string>;
  }
  const contents = fs.readFileSync(filePath, "utf8");
  const envValues: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const splitIndex = trimmed.indexOf("=");
    if (splitIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, splitIndex).trim();
    let value = trimmed.slice(splitIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    envValues[key] = value;
  }
  return envValues;
};

const envFileValues = readEnvFile(path.resolve("web", ".env"));
const cloudTestEmail =
  process.env.CLOUD_TEST_EMAIL ??
  process.env.VITE_CLOUD_TEST_EMAIL ??
  envFileValues.CLOUD_TEST_EMAIL ??
  envFileValues.VITE_CLOUD_TEST_EMAIL ??
  "";
const cloudTestPassword =
  process.env.CLOUD_TEST_PASSWORD ??
  process.env.VITE_CLOUD_TEST_PASSWORD ??
  envFileValues.CLOUD_TEST_PASSWORD ??
  envFileValues.VITE_CLOUD_TEST_PASSWORD ??
  "";

test.skip(
  !cloudTestEmail || !cloudTestPassword,
  "Set CLOUD_TEST_EMAIL/CLOUD_TEST_PASSWORD in web/.env or environment variables to run cloud sync test.",
);

test("test account can sync to firestore", async ({ page }) => {
  await resetStorage(page);

  const issues: string[] = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      issues.push(`[console:${type}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    issues.push(`[pageerror] ${error.message}`);
  });

  await page.goto("/");
  await page.locator('[data-action="open-cloud"]:visible').click();

  await page.fill("#cloud-email-input", cloudTestEmail);
  await page.fill("#cloud-password-input", cloudTestPassword);
  await page.click("#cloud-email-signin");

  const userCard = page.locator("#cloud-user");
  await expect(userCard).not.toHaveClass(/is-hidden/);

  // Sync is gated on a verified email, so an unverified test account cannot exercise this path.
  // Skip with an actionable message rather than failing on a disabled button.
  const needsVerification = await page
    .locator("#cloud-verification")
    .evaluate((element: Element) => !element.classList.contains("is-hidden"))
    .catch(() => false);
  test.skip(
    needsVerification,
    `The account ${cloudTestEmail} has not verified its email address, so cloud sync stays disabled. Verify it (or point CLOUD_TEST_EMAIL at a verified account) to run this test.`,
  );

  const syncButton = page.locator("#cloud-sync");
  await expect(syncButton).toBeEnabled();
  await syncButton.click();

  // The timestamp lives in #cloud-sync-status; #cloud-status only carries sign-in/verification
  // messaging.
  const synced = await page
    .waitForFunction(() => {
      const status = document.querySelector("#cloud-sync-status")?.textContent ?? "";
      return status.includes("Last synced at") || status.includes("Última sincronización");
    }, null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!synced) {
    const statusText = await page.locator("#cloud-sync-status").innerText();
    const logOutput = issues.length > 0 ? `\n\nConsole output:\n- ${issues.join("\n- ")}` : "";
    throw new Error(`Cloud sync did not complete. Status: "${statusText}".${logOutput}`);
  }
});
