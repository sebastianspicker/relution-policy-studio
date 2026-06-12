import type { JSX } from "react";
import { findAppleCompatSettingForDetails } from "../../../src/apple-compat.js";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import type { WorkspacePolicy } from "../../../src/workspace.js";
import { asRecord } from "./editor-utils.js";
import type { Selection } from "./types.js";

export function PolicyTree(props: {
  policy: WorkspacePolicy;
  policyIndex: number;
  selection: Selection | undefined;
  templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  isDirty: boolean;
  onSelect: (selection: Selection) => void;
  onMoveConfiguration: (selection: Selection, direction: "up" | "down") => void;
  onRemoveConfiguration: (selection: Selection) => void;
}): JSX.Element {
  const versions = Array.isArray(props.policy.document.versions) ? props.policy.document.versions : [];
  return (
    <div className="policy-tree">
      <h3>
        {typeof props.policy.document.name === "string" ? props.policy.document.name : props.policy.path}
        {props.isDirty ? <span className="dirty-dot" aria-label="Unsaved changes" /> : null}
      </h3>
      <p>{typeof props.policy.document.platform === "string" ? props.policy.document.platform : "UNKNOWN"}</p>
      {versions.map((version, versionIndex) => {
        const versionObject = asRecord(version);
        const configurations = Array.isArray(versionObject?.configurations) ? versionObject.configurations : [];
        const versionName = typeof versionObject?.name === "string" ? versionObject.name : `Version ${versionIndex + 1}`;
        const versionActive =
          props.selection?.policyIndex === props.policyIndex &&
          props.selection.versionIndex === versionIndex &&
          props.selection.configurationIndex === undefined;
        return (
          <div key={versionIndex} className="version-block">
            <button
              className={versionActive ? "tree-item version-item active" : "tree-item version-item"}
              onClick={() => props.onSelect({ policyIndex: props.policyIndex, versionIndex })}
            >
              {versionName}
            </button>
            {configurations.map((configuration, configurationIndex) => {
              const details = asRecord(asRecord(configuration)?.details);
              const type = typeof details?.type === "string" ? details.type : "UNKNOWN";
              const template = props.templatesByType.get(type);
              const appleCompatSetting = findAppleCompatSettingForDetails(details);
              const label = appleCompatSetting !== undefined ? `${appleCompatSetting.label} *` : template?.label ?? type;
              const rowSelection = { policyIndex: props.policyIndex, versionIndex, configurationIndex };
              const active =
                props.selection?.policyIndex === props.policyIndex &&
                props.selection.versionIndex === versionIndex &&
                props.selection.configurationIndex === configurationIndex;
              return (
                <div className="tree-item-row" key={`${versionIndex}-${configurationIndex}`}>
                  <button className={active ? "tree-item tree-item-select active" : "tree-item tree-item-select"} onClick={() => props.onSelect(rowSelection)}>
                    <span className="tree-item-label">{label}</span>
                    {appleCompatSetting !== undefined ? (
                      <span className="tree-item-meta">APPLE_MOBILECONFIG / {appleCompatSetting.payloadType}</span>
                    ) : template === undefined ? null : (
                      <span className="tree-item-meta">{type}</span>
                    )}
                  </button>
                  <div className="tree-item-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="Move up"
                      aria-label={`Move ${label} up`}
                      disabled={configurationIndex === 0}
                      onClick={() => props.onMoveConfiguration(rowSelection, "up")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Move down"
                      aria-label={`Move ${label} down`}
                      disabled={configurationIndex >= configurations.length - 1}
                      onClick={() => props.onMoveConfiguration(rowSelection, "down")}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Remove"
                      aria-label={`Remove ${label}`}
                      onClick={() => props.onRemoveConfiguration(rowSelection)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
