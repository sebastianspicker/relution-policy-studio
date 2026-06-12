import assert from "node:assert/strict";
import test from "node:test";
import { buildComplianceReport } from "../src/compliance.js";
import type { AppleSchemaCatalog } from "../src/apple-schema.js";
import type { RelutionTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace } from "../src/workspace.js";

test("buildComplianceReport rejects malformed selected configurations without mutating the workspace", () => {
  const workspace: PolicyWorkspace = {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_test.json",
        document: {
          uuid: "POLICY-1",
          name: "iOS policy",
          platform: "IOS",
          versions: [
            {
              uuid: "VERSION-1",
              configurations: [
                {
                  uuid: "CONF-1",
                  details: {
                    uuid: "DETAIL-1",
                    type: "NATIVE_SINGLE",
                    enforced: true,
                  },
                },
                "not-a-configuration",
              ],
            },
          ],
        },
      },
    ],
  };
  const beforeReport = structuredClone(workspace) as PolicyWorkspace;

  assert.throws(
    () =>
      buildComplianceReport({
        workspace,
        selection: { policyIndex: 0, versionIndex: 0 },
        sources: [],
        catalogs: {},
        bundle: {} as RelutionTemplateBundle,
        appleSchema: {} as AppleSchemaCatalog,
      }),
    /Selected policy version configuration is invalid: versions\[0\]\.configurations\[1\]/u,
  );
  assert.deepEqual(workspace, beforeReport);
});
