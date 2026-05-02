import assert from "node:assert/strict";
import test from "node:test";
import { createAppleCompatReport } from "../src/apple-compat-report.js";
import { loadTemplateBundle } from "../src/templates.js";

test("detects native Relution support for managed login items", () => {
  const bundle = loadTemplateBundle();
  const report = createAppleCompatReport(bundle);
  const managedLoginItems = report.settings.find((entry) => entry.id === "managed-login-items");

  assert.notEqual(managedLoginItems, undefined);
  assert.equal(managedLoginItems?.relutionNativeTypePresent, true);
});

test("does not claim unmeasured Relution export mobileconfig behavior", () => {
  const bundle = loadTemplateBundle();
  const report = createAppleCompatReport(bundle);

  assert.equal("relutionServerPolicyExportIncludesMobileconfig" in report.summary, false);
});
