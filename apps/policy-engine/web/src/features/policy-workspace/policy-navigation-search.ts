/** Builds searchable policy text from versions and configuration metadata. */
import { findAppleCompatSettingForDetails } from "../../../../src/browser/apple.js";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { asRecord } from "../../shared/editor-record-utils.js";

export function policyMatches(
  policy: WorkspacePolicy,
  query: string,
  templatesByType: ReadonlyMap<string, ConfigurationTemplate> = new Map<string, ConfigurationTemplate>(),
): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return true;
  const haystack = [
    policy.path,
    textValue(policy.document.name),
    textValue(policy.document.platform),
    ...configurationSearchTerms(policy, templatesByType),
  ].join(" ");
  return haystack.toLowerCase().includes(normalized);
}

function configurationSearchTerms(policy: WorkspacePolicy, templatesByType: ReadonlyMap<string, ConfigurationTemplate>): string[] {
  const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
  return versions.flatMap((version, versionIndex) => {
    const versionRecord = asRecord(version);
    const versionName = textValue(versionRecord?.name) || `Version ${versionIndex + 1}`;
    const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
    return [versionName, ...configurations.flatMap((configuration) => configurationTerms(configuration, templatesByType))];
  });
}

function configurationTerms(configuration: unknown, templatesByType: ReadonlyMap<string, ConfigurationTemplate>): string[] {
  const details = asRecord(asRecord(configuration)?.details);
  const type = textValue(details?.type);
  const template = templatesByType.get(type);
  const appleCompatSetting = findAppleCompatSettingForDetails(details);
  return [
    type,
    ...(template === undefined ? [] : [template.label, template.schemaName]),
    ...(appleCompatSetting === undefined ? [] : [appleCompatSetting.label, appleCompatSetting.payloadType]),
    textValue(details?.displayName),
    textValue(details?.secondLevelPayloadType),
  ];
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
