/** Detects dependency cycles and conflicting inherited MDM setting values. */
import type { MdmPolicySource, MdmValidationIssue } from "./mdm-types.js";
import { error } from "./mdm-validation-data.js";
import type { MdmPolicyEntry } from "./mdm-validation-policy.js";
import { flattenMdmValues } from "./mdm-validation-policy-values.js";

export function validatePolicyComposition(policies: MdmPolicyEntry[], issues: MdmValidationIssue[]): void {
  const byId = new Map(policies.map((entry) => [entry.source.policy_id, entry]));
  for (const entry of policies) validateEntryComposition(entry, byId, issues);
}

function validateEntryComposition(entry: MdmPolicyEntry, byId: Map<string, MdmPolicyEntry>, issues: MdmValidationIssue[]): void {
  const visiting = new Set<string>();
  const values = new Map<string, string>();
  const visit = (candidate: MdmPolicyEntry): void => {
    if (visiting.has(candidate.source.policy_id)) {
      issues.push(error(entry.path, `dependency cycle includes ${candidate.source.policy_id}`));
      return;
    }
    visiting.add(candidate.source.policy_id);
    for (const dependency of candidate.source.dependencies) {
      const dependencySource = byId.get(dependency);
      if (dependencySource !== undefined) visit(dependencySource);
    }
    reportCompositionConflicts(entry.path, candidate.source, values, issues);
    visiting.delete(candidate.source.policy_id);
  };
  visit(entry);
}

function reportCompositionConflicts(path: string, source: MdmPolicySource, values: Map<string, string>, issues: MdmValidationIssue[]): void {
  for (const setting of source.settings) {
    for (const [field, value] of flattenMdmValues(setting.values)) {
      const key = `${setting.configuration_type}.${field}`;
      const serialized = JSON.stringify(value);
      const previous = values.get(key);
      if (previous !== undefined && previous !== serialized) issues.push(error(path, `conflicting composed value for ${key}`));
      values.set(key, serialized);
    }
  }
}
