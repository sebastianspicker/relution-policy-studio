/** Derives template-backed editor choices for the selected policy and configuration. */
import { useMemo } from "react";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { versionRecord } from "../../shared/editor-workspace-utils.js";
import type { AppState, JsonRecord, Selection } from "../../shared/editor-contracts.js";

/** Returns template choices and existing native types for the selected policy. */
export function useEditorWorkspaceTemplateCatalog(props: {
  readonly state: AppState | undefined;
  readonly selection: Selection | undefined;
  readonly policy: WorkspacePolicy | undefined;
  readonly selectedPolicyPlatform: string;
  readonly details: JsonRecord | undefined;
}) {
  const templatesByType = useMemo(
    () => new Map((props.state?.bundle.configurationTypes ?? []).map((candidate) => [candidate.type, candidate])),
    [props.state],
  );
  const template = typeof props.details?.type === "string" ? templatesByType.get(props.details.type) : undefined;
  const creatablePlatforms = props.state?.bundle.platforms.filter((platform) => platform !== "UNKNOWN") ?? [];
  const availableTemplates = props.policy === undefined || props.state === undefined
    ? []
    : props.state.bundle.configurationTypes.filter((candidate) => candidate.platforms.includes(props.selectedPolicyPlatform));
  const presentNativeTypes = useMemo(() => {
    if (props.state === undefined || props.selection === undefined) {
      return [];
    }
    const version = versionRecord(props.state.workspace, props.selection.policyIndex, props.selection.versionIndex);
    const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
    return [...new Set(
      configurations
        .map((candidate) => candidate?.details)
        .map((candidate) => typeof candidate?.type === "string" ? candidate.type : "")
        .filter((candidate) => candidate.length > 0),
    )].sort();
  }, [props.selection, props.state]);

  return { templatesByType, template, creatablePlatforms, availableTemplates, presentNativeTypes };
}
