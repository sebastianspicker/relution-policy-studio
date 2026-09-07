/** Renders the policy configuration hierarchy and stable selection targets for navigation. */
import type { JSX } from "react";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { PolicyTreeVersion } from "./PolicyTreeVersion.js";
import type { Selection } from "../../shared/editor-contracts.js";

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
      {versions.map((version, versionIndex) => (
        <PolicyTreeVersion
          key={versionIndex}
          version={version}
          versionIndex={versionIndex}
          policyIndex={props.policyIndex}
          selection={props.selection}
          templatesByType={props.templatesByType}
          onSelect={props.onSelect}
          onMoveConfiguration={props.onMoveConfiguration}
          onRemoveConfiguration={props.onRemoveConfiguration}
        />
      ))}
    </div>
  );
}
