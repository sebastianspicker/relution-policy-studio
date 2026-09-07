/** Renders one policy version and its configuration rows. */
import type { JSX } from "react";
import type { ConfigurationTemplate } from "../../../../src/browser/workspace.js";
import { asRecord } from "../../shared/editor-record-utils.js";
import { PolicyTreeConfiguration } from "./PolicyTreeConfiguration.js";
import type { Selection } from "../../shared/editor-contracts.js";

export function PolicyTreeVersion(props: {
  readonly version: unknown;
  readonly versionIndex: number;
  readonly policyIndex: number;
  readonly selection: Selection | undefined;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  readonly onSelect: (selection: Selection) => void;
  readonly onMoveConfiguration: (selection: Selection, direction: "up" | "down") => void;
  readonly onRemoveConfiguration: (selection: Selection) => void;
}): JSX.Element {
  const versionRecord = asRecord(props.version);
  const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
  const versionName = typeof versionRecord?.name === "string" ? versionRecord.name : `Version ${props.versionIndex + 1}`;
  const active = props.selection?.policyIndex === props.policyIndex
    && props.selection.versionIndex === props.versionIndex
    && props.selection.configurationIndex === undefined;
  return (
    <div className="version-block">
      <button
        className={active ? "tree-item version-item active" : "tree-item version-item"}
        onClick={() => props.onSelect({ policyIndex: props.policyIndex, versionIndex: props.versionIndex })}
      >
        {versionName}
      </button>
      {configurations.map((configuration, configurationIndex) => (
        <PolicyTreeConfiguration
          key={`${props.versionIndex}-${configurationIndex}`}
          configuration={configuration}
          configurationIndex={configurationIndex}
          configurationCount={configurations.length}
          policyIndex={props.policyIndex}
          versionIndex={props.versionIndex}
          selection={props.selection}
          templatesByType={props.templatesByType}
          onSelect={props.onSelect}
          onMove={props.onMoveConfiguration}
          onRemove={props.onRemoveConfiguration}
        />
      ))}
    </div>
  );
}
