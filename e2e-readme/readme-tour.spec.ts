import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const outputDir = resolve("docs/readme-tour");
const archiveKey = "key123";
const rulesetPath = resolve("example/relution-baseline-templates/tiered/ios/tier-3-modules.json");

test("generate README product tour screenshots", async ({ page }) => {
  mkdirSync(outputDir, { recursive: true });
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await mockDashboardApi(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await stabilizeForScreenshots(page);
  await expect(page.getByText("Relution Policy Workbench")).toBeVisible();
  await capture(page, "01-editor-overview.png");

  await page.getByRole("button", { name: "Baseline" }).first().click();
  await expect(page.getByRole("heading", { name: "Policy Wizard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace workspace with selected baseline" })).toBeVisible();
  await capture(page, "02-baseline-guided.png");

  await page.getByRole("tab", { name: "Expert selection" }).click();
  await page.getByRole("checkbox", { name: "Vendor" }).uncheck();
  await page.getByRole("checkbox", { name: "CIS" }).uncheck();
  await expect(page.getByText("Selected baseline coverage")).toBeVisible();
  await capture(page, "03-baseline-expert.png");

  await page.getByRole("button", { name: "Replace workspace with expert selection" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Applied expert baseline selection");
  await page.getByRole("button", { name: "Policies" }).first().click();
  await page.locator(".tree-item-select").first().click();
  await expect(page.getByRole("heading", { level: 1, name: "iOS Passcode" })).toBeVisible();
  await capture(page, "04-policy-editor.png");

  await page.getByRole("button", { name: "Baseline" }).first().click();
  await page.getByRole("tab", { name: "Compliance" }).click();
  await expect(page.getByRole("heading", { name: "Compliance" })).toBeVisible();
  await capture(page, "05-compliance.png");

  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByLabel("Encryption key").fill(archiveKey);
  await page.getByRole("button", { name: "Set key" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Key set");
  await page.getByLabel("Ruleset JSON file").setInputFiles(rulesetPath);
  await page.getByRole("button", { name: "Import ruleset" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Imported ruleset");
  await page.getByRole("button", { name: "Build .rexp" }).click();
  await expect(page.locator(".status-bar-message")).toContainText("Built");
  await capture(page, "06-settings-import-export.png");

  await page.getByRole("button", { name: "Dashboard" }).first().click();
  await page.getByLabel("Server").first().fill("relution.example.org");
  await page.getByLabel("API token").first().fill("readme-tour-token");
  await page.getByRole("button", { name: "Set session" }).click();
  await expect(page.getByText("Relution https://relution.example.org | read-only")).toBeVisible();
  await page.getByLabel("Expected policies").fill("IOS=iOS Tier 3 Baseline - iOS Passcode");
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByRole("status", { name: "Relution device summary" })).toBeVisible();
  await page.getByRole("button", { name: "Write report" }).click();
  await expect(page.getByText("Report written:")).toBeVisible();
  await capture(page, "07-relution-dashboard.png");
});

async function capture(page: Page, filename: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: resolve(outputDir, filename),
    animations: "disabled",
  });
}

async function stabilizeForScreenshots(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function mockDashboardApi(page: Page): Promise<void> {
  await page.route("**/api/relution/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        baseUrl: "https://relution.example.org",
        tokenConfigured: true,
        mode: "read-only",
      }),
    });
  });
  await page.route("**/api/relution/devices/audit", async (route) => {
    const devices = [
      {
        uuid: "READ-ME-IOS-1",
        name: "Faculty iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "APPLIED",
        lastConnectionDate: "2026-04-26T08:15:00.000Z",
        inactiveDays: 0,
        ownership: "CORPORATE",
        userEmail: "faculty@example.invalid",
        assignedPolicies: ["iOS Tier 3 Baseline - iOS Passcode"],
        raw: {},
      },
      {
        uuid: "READ-ME-IOS-2",
        name: "Loaner iPad",
        platform: "IOS",
        status: "COMPLIANT",
        policyStatus: "NONE",
        lastConnectionDate: "2026-01-01T00:00:00.000Z",
        inactiveDays: 115,
        ownership: "CORPORATE",
        userEmail: "loaner@example.invalid",
        assignedPolicies: [],
        raw: {},
      },
    ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        query: {
          baseUrl: "https://relution.example.org",
          count: devices.length,
          total: devices.length,
          devices,
        },
        report: {
          generatedAt: "2026-04-26T10:00:00.000Z",
          baseUrl: "https://relution.example.org",
          summary: {
            totalDevices: 2,
            compliant: 1,
            issue: 1,
            notCheckable: 0,
            missingPolicy: 1,
            inactiveWarning: 0,
            inactiveProblem: 1,
            byPlatform: { IOS: 2 },
            byStatus: { COMPLIANT: 2 },
            byPolicyStatus: { APPLIED: 1, NONE: 1 },
          },
          devices: [
            { device: devices[0], status: "compliant", issues: [] },
            {
              device: devices[1],
              status: "issue",
              issues: [
                {
                  id: "missing-policy",
                  severity: "problem",
                  message: "Missing expected policies: iOS Tier 3 Baseline - iOS Passcode.",
                  evidence: { missingPolicies: "iOS Tier 3 Baseline - iOS Passcode" },
                },
                {
                  id: "inactive-problem",
                  severity: "problem",
                  message: "Device has not connected for 115 days.",
                  evidence: { inactiveDays: "115", thresholdDays: "90" },
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/api/relution/reports/compliance", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        jsonPath: "/tmp/relution-policy-workbench-readme-tour/compliance-report.json",
        markdownPath: "/tmp/relution-policy-workbench-readme-tour/compliance-report.md",
      }),
    });
  });
}
