import { useState, type JSX } from "react";
import { findAppleCompatSettingForDetails } from "../../../src/apple-compat.js";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import type { WorkspacePolicy } from "../../../src/workspace.js";
import { asRecord } from "./editor-utils.js";
import { PolicyTree } from "./PolicyTree.js";
import type { Selection } from "./types.js";

export function PolicyNavigator(props: {
  readonly policies: readonly WorkspacePolicy[];
  readonly selection: Selection | undefined;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  readonly newPolicyName: string;
  readonly newPolicyPlatform: string;
  readonly creatablePlatforms: readonly string[];
  readonly isDirty: boolean;
  readonly onSelect: (selection: Selection) => void;
  readonly onMoveConfiguration: (selection: Selection, direction: "up" | "down") => void;
  readonly onRemoveConfiguration: (selection: Selection) => void;
  readonly onNewPolicyNameChange: (name: string) => void;
  readonly onNewPolicyPlatformChange: (platform: string) => void;
  readonly onCreatePolicy: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(props.policies.length === 0);
  const visiblePolicies = props.policies
    .map((policy, policyIndex) => ({ policy, policyIndex }))
    .filter(({ policy }) => policyMatches(policy, query, props.templatesByType));
  return (
    <div className="policy-navigator">
      <div className="nav-toolbar">
        <input
          aria-label="Search policies"
          placeholder="Search policies"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="nav-new-btn"
          title="New policy"
          aria-label="New policy"
          aria-expanded={showCreate}
          onClick={() => setShowCreate((s) => !s)}
        >
          +
        </button>
      </div>
      <div className={`new-policy-form-wrapper${showCreate ? " new-policy-form-wrapper--open" : ""}`}>
        <div className="new-policy-form">
          <label>
            <span className="field-label">Name</span>
            <input
              aria-label="New policy name"
              placeholder="Policy name"
              value={props.newPolicyName}
              onChange={(e) => props.onNewPolicyNameChange(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Platform</span>
            <select
              aria-label="New policy platform"
              value={props.newPolicyPlatform}
              onChange={(e) => props.onNewPolicyPlatformChange(e.target.value)}
            >
              {props.creatablePlatforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
          <div className="new-policy-form-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                props.onCreatePolicy();
                setShowCreate(false);
              }}
            >
              Create
            </button>
            <button type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
      {visiblePolicies.length === 0 && !showCreate ? (
        <p className="empty-state">
          {props.policies.length === 0
            ? "No policies yet. Use + to create one."
            : "No policies match the search."}
        </p>
      ) : null}
      {visiblePolicies.map(({ policy, policyIndex }) => (
        <PolicyTree
          key={policy.path}
          policy={policy}
          policyIndex={policyIndex}
          selection={props.selection}
          templatesByType={props.templatesByType}
          isDirty={props.isDirty}
          onSelect={props.onSelect}
          onMoveConfiguration={props.onMoveConfiguration}
          onRemoveConfiguration={props.onRemoveConfiguration}
        />
      ))}
    </div>
  );
}

export function policyMatches(
  policy: WorkspacePolicy,
  query: string,
  templatesByType: ReadonlyMap<string, ConfigurationTemplate> = new Map<string, ConfigurationTemplate>(),
): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
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
    template?.label ?? "",
    template?.schemaName ?? "",
    appleCompatSetting?.label ?? "",
    appleCompatSetting?.payloadType ?? "",
    textValue(details?.displayName),
    textValue(details?.secondLevelPayloadType),
  ];
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
