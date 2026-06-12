import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { appleCompatSettingsForPlatform, findAppleCompatSettingForDetails } from "../../../src/apple-compat.js";
import { appleSchemaEntriesForPlatform, findAppleSchemaProfileForDetails, type AppleSchemaEntry } from "../../../src/apple-schema.js";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import type { WorkspacePolicy, WorkspaceValidationResult } from "../../../src/workspace.js";
import {
  asRecord,
  emptyAppleSchemaCatalog,
  loadState,
  postJson,
  readJsonResponse,
  selectedConfiguration,
  versionRecord,
} from "./editor-utils.js";
import type {
  AddGroup,
  AppState,
  EditorActionResult,
  InspectorTab,
  JsonRecord,
  RulesetImportReport,
  Selection,
} from "./types.js";
import type { WorkspaceHistoryEntry } from "./useEditorControllerActionTypes.js";

const LIVE_VALIDATION_DELAY_MS = 250;

export interface EditorWorkspaceState {
  readonly state: AppState | undefined;
  readonly loadError: string | undefined;
  readonly selection: Selection | undefined;
  readonly rawJson: string;
  readonly rawJsonDirty: boolean;
  readonly canonicalRawJson: string;
  readonly selectedType: string;
  readonly addQuery: string;
  readonly addGroup: AddGroup;
  readonly inspectorTab: InspectorTab;
  readonly newPolicyPlatform: string;
  readonly newPolicyName: string;
  readonly keyValue: string;
  readonly importFile: File | undefined;
  readonly jsonTemplateFile: File | undefined;
  readonly rulesetFile: File | undefined;
  readonly rulesetReport: RulesetImportReport | undefined;
  readonly status: string;
  readonly lastActionResult: EditorActionResult | undefined;
  readonly isDirty: boolean;
  readonly isBuildLoading: boolean;
  readonly hasFreshBuild: boolean;
  readonly undoStack: readonly WorkspaceHistoryEntry[];
  readonly redoStack: readonly WorkspaceHistoryEntry[];
  readonly ddmSchemaId: string;
  readonly mdmCommandSchemaId: string;
  readonly policy: WorkspacePolicy | undefined;
  readonly configuration: JsonRecord | undefined;
  readonly details: JsonRecord | undefined;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
  readonly template: ConfigurationTemplate | undefined;
  readonly appleCompatSetting: ReturnType<typeof findAppleCompatSettingForDetails>;
  readonly appleSchemaProfile: ReturnType<typeof findAppleSchemaProfileForDetails>;
  readonly creatablePlatforms: string[];
  readonly availableTemplates: ConfigurationTemplate[];
  readonly presentNativeTypes: string[];
  readonly availableAppleCompatSettings: ReturnType<typeof appleCompatSettingsForPlatform>;
  readonly availableAppleSchemaProfiles: AppleSchemaEntry[];
  readonly availableDdmEntries: AppleSchemaEntry[];
  readonly availableMdmCommands: AppleSchemaEntry[];
  readonly setState: Dispatch<SetStateAction<AppState | undefined>>;
  readonly setSelection: Dispatch<SetStateAction<Selection | undefined>>;
  readonly setRawJsonState: Dispatch<SetStateAction<string>>;
  readonly setRawJsonDirty: Dispatch<SetStateAction<boolean>>;
  readonly setSelectedType: Dispatch<SetStateAction<string>>;
  readonly setAddQuery: Dispatch<SetStateAction<string>>;
  readonly setAddGroup: Dispatch<SetStateAction<AddGroup>>;
  readonly setInspectorTab: Dispatch<SetStateAction<InspectorTab>>;
  readonly setNewPolicyPlatform: Dispatch<SetStateAction<string>>;
  readonly setNewPolicyName: Dispatch<SetStateAction<string>>;
  readonly setKeyValue: Dispatch<SetStateAction<string>>;
  readonly setImportFile: Dispatch<SetStateAction<File | undefined>>;
  readonly setJsonTemplateFile: Dispatch<SetStateAction<File | undefined>>;
  readonly setRulesetFile: Dispatch<SetStateAction<File | undefined>>;
  readonly setRulesetReport: Dispatch<SetStateAction<RulesetImportReport | undefined>>;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setLastActionResult: Dispatch<SetStateAction<EditorActionResult | undefined>>;
  readonly setIsDirty: Dispatch<SetStateAction<boolean>>;
  readonly setIsBuildLoading: Dispatch<SetStateAction<boolean>>;
  readonly setHasFreshBuild: Dispatch<SetStateAction<boolean>>;
  readonly setUndoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setRedoStack: Dispatch<SetStateAction<readonly WorkspaceHistoryEntry[]>>;
  readonly setDdmSchemaId: Dispatch<SetStateAction<string>>;
  readonly setMdmCommandSchemaId: Dispatch<SetStateAction<string>>;
}

export function useWorkspaceState(): EditorWorkspaceState {
  const [state, setState] = useState<AppState | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [selection, setSelection] = useState<Selection | undefined>();
  const [rawJson, setRawJsonState] = useState("");
  const [rawJsonDirty, setRawJsonDirty] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addGroup, setAddGroup] = useState<AddGroup>("all");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("validation");
  const [newPolicyPlatform, setNewPolicyPlatform] = useState("");
  const [newPolicyName, setNewPolicyName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [importFile, setImportFile] = useState<File | undefined>();
  const [jsonTemplateFile, setJsonTemplateFile] = useState<File | undefined>();
  const [rulesetFile, setRulesetFile] = useState<File | undefined>();
  const [rulesetReport, setRulesetReport] = useState<RulesetImportReport | undefined>();
  const [status, setStatus] = useState("");
  const [lastActionResult, setLastActionResult] = useState<EditorActionResult | undefined>();
  const [isDirty, setIsDirty] = useState(false);
  const [hasFreshBuild, setHasFreshBuild] = useState(false);
  const [undoStack, setUndoStack] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [ddmSchemaId, setDdmSchemaId] = useState("");
  const [mdmCommandSchemaId, setMdmCommandSchemaId] = useState("");
  const [isBuildLoading, setIsBuildLoading] = useState(false);

  useInitialEditorState({
    setLoadError,
    setState,
    setSelection,
    setRawJsonState,
    setRawJsonDirty,
    setHasFreshBuild,
  });
  useLiveValidation(isDirty, state, setState, setStatus);
  useDirtyBeforeUnloadWarning(isDirty);

  const policy = state !== undefined && selection !== undefined ? state.workspace.policies[selection.policyIndex] : undefined;
  const configuration = state !== undefined && selection !== undefined ? selectedConfiguration(state.workspace, selection) : undefined;
  const selectedConfigurationKey =
    selection === undefined || configuration === undefined
      ? ""
      : `${policy?.path ?? "no-policy"}:${selection.versionIndex}:${selection.configurationIndex ?? -1}:${typeof configuration.uuid === "string" ? configuration.uuid : ""}`;
  const canonicalRawJson = configuration === undefined ? "" : JSON.stringify(configuration, null, 2);
  const details = asRecord(configuration?.details);
  const templatesByType = useMemo(
    () => new Map((state?.bundle.configurationTypes ?? []).map((candidate) => [candidate.type, candidate])),
    [state],
  );
  const template = typeof details?.type === "string" ? templatesByType.get(details.type) : undefined;
  const appleCompatSetting = findAppleCompatSettingForDetails(details);
  const appleSchemaProfile = findAppleSchemaProfileForDetails(state?.appleSchema ?? emptyAppleSchemaCatalog(), details);
  const creatablePlatforms = useMemo(() => state?.bundle.platforms.filter((platform) => platform !== "UNKNOWN") ?? [], [state]);
  const availableTemplates = useMemo(() => {
    if (policy === undefined || state === undefined) {
      return [];
    }
    const platform = typeof policy.document.platform === "string" ? policy.document.platform : "";
    return state.bundle.configurationTypes.filter((candidate) => candidate.platforms.includes(platform));
  }, [policy, state]);
  const presentNativeTypes = useMemo(() => {
    if (state === undefined || selection === undefined) {
      return [];
    }
    const version = versionRecord(state.workspace, selection.policyIndex, selection.versionIndex);
    const configurations = Array.isArray(version?.configurations) ? version.configurations : [];
    return [...new Set(
      configurations
        .map((candidate) => asRecord(asRecord(candidate)?.details))
        .map((candidate) => (typeof candidate?.type === "string" ? candidate.type : ""))
        .filter((candidate) => candidate.length > 0),
    )].sort();
  }, [selection, state]);
  const availableAppleCompatSettings = useMemo(() => {
    if (policy === undefined) {
      return [];
    }
    const platform = typeof policy.document.platform === "string" ? policy.document.platform : "";
    return appleCompatSettingsForPlatform(platform);
  }, [policy]);
  const availableAppleSchemaProfiles = useMemo(() => {
    if (policy === undefined || state === undefined) {
      return [];
    }
    const platform = typeof policy.document.platform === "string" ? policy.document.platform : "";
    return appleSchemaEntriesForPlatform(state.appleSchema, platform, "profile");
  }, [policy, state]);
  const availableDdmEntries = useMemo(
    () =>
      (state?.appleSchema.entries ?? []).filter(
        (entry) =>
          entry.kind === "ddm-configuration" ||
          entry.kind === "ddm-asset" ||
          entry.kind === "ddm-activation" ||
          entry.kind === "ddm-management",
      ),
    [state],
  );
  const availableMdmCommands = useMemo(() => (state?.appleSchema.entries ?? []).filter((entry) => entry.kind === "mdm-command"), [state]);

  useRawJsonSync(canonicalRawJson, selectedConfigurationKey, rawJsonDirty, setRawJsonState, setRawJsonDirty);
  useEditorDefaultSelections({
    availableDdmEntries,
    availableMdmCommands,
    creatablePlatforms,
    ddmSchemaId,
    mdmCommandSchemaId,
    newPolicyPlatform,
    policyPath: policy?.path,
    setDdmSchemaId,
    setMdmCommandSchemaId,
    setNewPolicyPlatform,
    setSelectedType,
  });

  return {
    state,
    loadError,
    selection,
    rawJson,
    rawJsonDirty,
    canonicalRawJson,
    selectedType,
    addQuery,
    addGroup,
    inspectorTab,
    newPolicyPlatform,
    newPolicyName,
    keyValue,
    importFile,
    jsonTemplateFile,
    rulesetFile,
    rulesetReport,
    status,
    lastActionResult,
    isDirty,
    isBuildLoading,
    hasFreshBuild,
    undoStack,
    redoStack,
    ddmSchemaId,
    mdmCommandSchemaId,
    policy,
    configuration,
    details,
    templatesByType,
    template,
    appleCompatSetting,
    appleSchemaProfile,
    creatablePlatforms,
    availableTemplates,
    presentNativeTypes,
    availableAppleCompatSettings,
    availableAppleSchemaProfiles,
    availableDdmEntries,
    availableMdmCommands,
    setState,
    setSelection,
    setRawJsonState,
    setRawJsonDirty,
    setSelectedType,
    setAddQuery,
    setAddGroup,
    setInspectorTab,
    setNewPolicyPlatform,
    setNewPolicyName,
    setKeyValue,
    setImportFile,
    setJsonTemplateFile,
    setRulesetFile,
    setRulesetReport,
    setStatus,
    setLastActionResult,
    setIsDirty,
    setIsBuildLoading,
    setHasFreshBuild,
    setUndoStack,
    setRedoStack,
    setDdmSchemaId,
    setMdmCommandSchemaId,
  };
}

function useInitialEditorState(props: {
  readonly setLoadError: Dispatch<SetStateAction<string | undefined>>;
  readonly setState: Dispatch<SetStateAction<AppState | undefined>>;
  readonly setSelection: Dispatch<SetStateAction<Selection | undefined>>;
  readonly setRawJsonState: Dispatch<SetStateAction<string>>;
  readonly setRawJsonDirty: Dispatch<SetStateAction<boolean>>;
  readonly setHasFreshBuild: Dispatch<SetStateAction<boolean>>;
}): void {
  useEffect(() => {
    let cancelled = false;
    void loadState().then((loaded) => {
      if (cancelled) {
        return;
      }
      props.setLoadError(undefined);
      props.setState(loaded);
      props.setSelection(undefined);
      props.setRawJsonState("");
      props.setRawJsonDirty(false);
      props.setHasFreshBuild(false);
    }).catch((error: unknown) => {
      if (!cancelled) {
        props.setLoadError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

function useLiveValidation(
  isDirty: boolean,
  state: AppState | undefined,
  setState: Dispatch<SetStateAction<AppState | undefined>>,
  setStatus: Dispatch<SetStateAction<string>>,
): void {
  useEffect(() => {
    if (!isDirty || state === undefined) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void postJson("/api/workspace/validate", { workspace: state.workspace }).then(async (response) => {
        const result = await readJsonResponse<{ validation: WorkspaceValidationResult }>(response);
        if (!cancelled && response.ok) {
          setState((current) => current === undefined ? current : { ...current, validation: result.validation });
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setState((current) => current === undefined ? current : { ...current, validation: { ok: false, errors: [{ path: "workspace", message }] } });
          setStatus(`Live validation failed: ${message}`);
        }
      });
    }, LIVE_VALIDATION_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isDirty, setState, setStatus, state?.workspace]);
}

function useDirtyBeforeUnloadWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);
}

function useRawJsonSync(
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

function useEditorDefaultSelections(props: {
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
