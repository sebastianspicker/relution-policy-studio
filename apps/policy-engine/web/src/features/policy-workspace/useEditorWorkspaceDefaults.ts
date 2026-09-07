/** Keeps editor defaults and raw JSON synchronized with the selected workspace. */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppleSchemaEntry } from "../../../../src/browser/apple.js";

/** Resets raw JSON only when its selected configuration or canonical source changes. */
export function useEditorWorkspaceRawJsonSync(
  canonicalRawJson: string,
  selectedConfigurationKey: string,
  rawJsonDirty: boolean,
  setRawJsonState: Dispatch<SetStateAction<string>>,
  setRawJsonDirty: Dispatch<SetStateAction<boolean>>,
): void {
  useEffect(() => {
    setRawJsonState(canonicalRawJson);
    setRawJsonDirty(false);
  }, [selectedConfigurationKey, setRawJsonDirty, setRawJsonState]);

  useEffect(() => {
    if (!rawJsonDirty) {
      setRawJsonState(canonicalRawJson);
    }
  }, [canonicalRawJson, rawJsonDirty, setRawJsonState]);
}

/** Chooses first available platform and Apple schema entries without overwriting a choice. */
export function useEditorWorkspaceDefaults(props: {
  readonly availableDdmEntries: AppleSchemaEntry[];
  readonly availableMdmCommands: AppleSchemaEntry[];
  readonly creatablePlatforms: string[];
  readonly ddmSchemaId: string;
  readonly mdmCommandSchemaId: string;
  readonly newPolicyPlatform: string;
  readonly policyPath: string | undefined;
  readonly setDdmSchemaId: Dispatch<SetStateAction<string>>;
  readonly setMdmCommandSchemaId: Dispatch<SetStateAction<string>>;
  readonly setNewPolicyPlatform: Dispatch<SetStateAction<string>>;
  readonly setSelectedType: Dispatch<SetStateAction<string>>;
}): void {
  useEffect(() => {
    if (props.newPolicyPlatform.length === 0 && props.creatablePlatforms[0] !== undefined) {
      props.setNewPolicyPlatform(props.creatablePlatforms[0]);
    }
  }, [props.creatablePlatforms, props.newPolicyPlatform, props.setNewPolicyPlatform]);

  useEffect(() => {
    props.setSelectedType("");
  }, [props.policyPath, props.setSelectedType]);

  useEffect(() => {
    if (props.ddmSchemaId.length === 0 && props.availableDdmEntries[0] !== undefined) {
      props.setDdmSchemaId(props.availableDdmEntries[0].id);
    }
  }, [props.availableDdmEntries, props.ddmSchemaId, props.setDdmSchemaId]);

  useEffect(() => {
    if (props.mdmCommandSchemaId.length === 0 && props.availableMdmCommands[0] !== undefined) {
      props.setMdmCommandSchemaId(props.availableMdmCommands[0].id);
    }
  }, [props.availableMdmCommands, props.mdmCommandSchemaId, props.setMdmCommandSchemaId]);
}
