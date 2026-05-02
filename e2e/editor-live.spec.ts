import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const archiveKey = "key123";
const rulesetPath = resolve("example/relution-baseline-templates/tiered/ios/tier-3-modules.json");
const fixtureRexpPath = resolve("example/sample-policy-export.rexp");

test("wizard, ruleset import, rexp build/download, and rexp import work in the browser", async ({ page }) => {
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });

  await page.goto("/");
  await expect(page.getByText("Relution Policy Workbench")).toBeVisible();

  const stateResponse = await page.request.get("/api/state");
  await expect(stateResponse).toBeOK();
  const coverageResponse = await page.request.get("/api/recommendations/coverage");
  await expect(coverageResponse).toBeOK();
  const templatesResponse = await page.request.get("/api/baseline-templates");
  await expect(templatesResponse).toBeOK();
  const semanticAnalysisResponse = await page.request.get("/api/recommendations/semantic-analysis");
  await expect(semanticAnalysisResponse).toBeOK();

  await page.getByRole("button", { name: "Baseline" }).first().click();
  await expect(page.getByRole("heading", { name: "Policy Wizard" })).toBeVisible();
  await page.getByRole("button", { name: "Replace workspace with selected baseline" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Applied baseline template");

  await page.getByRole("tab", { name: "Expert selection" }).click();
  await page.getByRole("checkbox", { name: "Vendor" }).uncheck();
  await page.getByRole("checkbox", { name: "CIS" }).uncheck();
  await expect(page.getByText("Selected baseline coverage")).toBeVisible();
  await page.getByRole("button", { name: "Replace workspace with expert selection" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Applied expert baseline selection");

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByLabel("Encryption key").fill(archiveKey);
  await page.getByRole("button", { name: "Set key" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Key set");

  await page.getByLabel("Ruleset JSON file").setInputFiles(rulesetPath);
  await page.getByRole("button", { name: "Import ruleset" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Imported ruleset");

  await page.getByRole("button", { name: "Build .rexp" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Built");
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).click();
  const download = await downloadPromise;
  const downloadedArchive = test.info().outputPath("playwright-built.rexp");
  await download.saveAs(downloadedArchive);

  const nodeEnv = { ...process.env };
  delete nodeEnv.FORCE_COLOR;
  const verifyOutput = execFileSync("node", ["dist/src/cli.js", "verify", downloadedArchive, "--key", archiveKey], {
    encoding: "utf8",
    env: nodeEnv,
  });
  expect(verifyOutput).toContain("VERDICT: PASS");

  await page.getByLabel("Relution .rexp file").setInputFiles(fixtureRexpPath);
  await page.getByRole("button", { name: /^Import$/u }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Imported sample-policy-export");

  await page.getByRole("button", { name: "Policies" }).first().click();
  await expect(page.getByRole("heading", { name: "Example iOS Policy" })).toBeVisible();
});
