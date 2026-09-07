/** Transforms external recommendation rulesets into safe, editable workspace configurations. */
import {
  createWorkspaceExportReport,
  createWorkspaceMetadata,
  createWorkspacePolicyEntry,
} from "../../../../src/browser/workspace.js";
import { newBrowserUuid } from "../../shared/editor-workspace-utils.js";
import { builtInRulesetMappings, configurationFromMapping } from "../../shared/ruleset-import-mappings.js";
import { parseRuleset } from "./ruleset-import-parser.js";
import { rulesetSuggestions } from "./ruleset-import-suggestions.js";
import type { JsonRecord } from "../../shared/editor-contracts.js";
import type {
  ImportContext,
  RulesetImportOptions,
  RulesetImportReport,
  RulesetImportResult,
  RulesetPolicy,
} from "../../shared/ruleset-import-contracts.js";

export type {
  RulesetImportOptions,
  RulesetImportResult,
} from "../../shared/ruleset-import-contracts.js";

/**
 * Builds a workspace only when every required rule is resolved, preventing partial imports.
 */
export function importRulesetWorkspace(
  input: unknown,
  bundle: ImportContext["bundle"],
  appleSchema: ImportContext["appleSchema"],
  options: RulesetImportOptions = {},
): RulesetImportResult {
  const ruleset = parseRuleset(input);
  const context: ImportContext = {
    bundle,
    appleSchema,
    now: options.now ?? Date.now(),
    uuidFactory: options.uuidFactory ?? newBrowserUuid,
    templatesByType: new Map(bundle.configurationTypes.map((template) => [template.type, template])),
  };
  const report: RulesetImportReport = { applied: [], unresolved: [], conflicts: [], warnings: [] };
  const policies = ruleset.policies.map((policy) => createPolicy(policy, context, report));
  if (report.conflicts.length > 0 || report.unresolved.length > 0) {
    return { report };
  }
  return {
    workspace: {
      metadata: createWorkspaceMetadata(bundle.serverVersion),
      report: createWorkspaceExportReport(
        policies.map((policy) => ({ uuid: policy.uuid, name: String(policy.document.name ?? "Policy") })),
      ),
      policies: policies.map((policy) => ({ path: policy.path, document: policy.document })),
    },
    report,
  };
}

function createPolicy(
  policy: RulesetPolicy,
  context: ImportContext,
  report: RulesetImportReport,
): { uuid: string; path: string; document: JsonRecord } {
  const policyUuid = context.uuidFactory();
  const versionUuid = context.uuidFactory();
  const configurations: JsonRecord[] = [];
  const seenSingleTypes = new Set<string>();
  for (const rule of policy.rules) {
    const mappings = rule.mappings.length > 0 ? rule.mappings : builtInRulesetMappings(rule.id);
    if (mappings.length === 0) {
      if (!rule.informational) {
        report.unresolved.push({
          policyName: policy.name,
          ruleId: rule.id,
          title: rule.title,
          suggestions: rulesetSuggestions(rule, policy.platform, context),
        });
      }
      continue;
    }
    for (const mapping of mappings) {
      const configuration = configurationFromMapping(policy, rule, mapping, context, report, seenSingleTypes);
      if (configuration !== undefined) {
        configurations.push(configuration);
      }
    }
  }
  return {
    uuid: policyUuid,
    ...createWorkspacePolicyEntry({
      uuid: policyUuid,
      versionUuid,
      now: context.now,
      name: policy.name,
      platform: policy.platform,
      description: policy.description ?? "",
      configurations,
    }),
  };
}
