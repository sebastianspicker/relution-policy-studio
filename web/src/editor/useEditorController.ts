import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { appleCompatSettingsForPlatform, findAppleCompatSettingForDetails } from "../../../src/apple-compat.js";
import { appleSchemaEntriesForPlatform, findAppleSchemaProfileForDetails, type AppleSchemaEntry } from "../../../src/apple-schema.js";
import type { ComplianceReport } from "../../../src/compliance.js";
import type {
  RecommendationCatalogResponse,
  RecommendationIndexResponse,
  RecommendationSource,
  RecommendationSourceSummary,
} from "../../../src/recommendation-types.js";
import type { PolicyWorkspace, WorkspacePolicy, WorkspaceValidationResult } from "../../../src/workspace.js";
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
  EditorControllerResult,
  InspectorTab,
  JsonRecord,
  RulesetImportReport,
  Selection,
} from "./types.js";
import { ALL_RECOMMENDATION_PLATFORMS, policyPlatform, preferredRecommendationPlatform } from "./recommendation-platform.js";
import { useEditorControllerActions } from "./useEditorControllerActions.js";
import type { WorkspaceHistoryEntry } from "./useEditorControllerActionTypes.js";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const LIVE_VALIDATION_DELAY_MS = 250;
const COMPLIANCE_REFRESH_DELAY_MS = 250;

export function useEditorController(): EditorControllerResult {
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
  const [isDirty, setIsDirty] = useState(false);
  const [hasFreshBuild, setHasFreshBuild] = useState(false);
  const [undoStack, setUndoStack] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [recommendationIndex, setRecommendationIndex] = useState<RecommendationIndexResponse | undefined>();
  const [recommendationCatalogs, setRecommendationCatalogs] = useState<Partial<Record<RecommendationSource, RecommendationCatalogResponse>>>({});
  const [recommendationSource, setRecommendationSourceState] = useState<RecommendationSource>("bsi");
  const [recommendationQuery, setRecommendationQuery] = useState("");
  const [recommendationPlatform, setRecommendationPlatform] = useState(ALL_RECOMMENDATION_PLATFORMS);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | undefined>();
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | undefined>();
  const [complianceSources, setComplianceSources] = useState<RecommendationSource[]>(["bsi", "vendor", "cis"]);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | undefined>();
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState<string | undefined>();
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
  const recommendationCatalog = recommendationCatalogs[recommendationSource];
  const recommendationSummary = recommendationIndex?.sources.find((candidate) => candidate.source === recommendationSource);

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

  useRecommendationData({
    policy,
    recommendationCatalog,
    recommendationIndex,
    recommendationSource,
    recommendationSummary,
    setRecommendationCatalogs,
    setRecommendationIndex,
    setRecommendationPlatform,
    setRecommendationsError,
    setRecommendationsLoading,
  });
  useComplianceReportRefresh({
    complianceSources,
    selection,
    setComplianceError,
    setComplianceLoading,
    setComplianceReport,
    state,
  });

  if (state === undefined) {
    return loadError === undefined ? { kind: "loading" } : { kind: "error", message: loadError };
  }
  const currentState = state;
  const actions = useEditorControllerActions({
    currentState,
    isDirty,
    selection,
    policy,
    configuration,
    details,
    canonicalRawJson,
    rawJson,
    selectedType,
    newPolicyPlatform,
    newPolicyName,
    keyValue,
    importFile,
    jsonTemplateFile,
    rulesetFile,
    recommendationCatalog,
    recommendationSummary,
    recommendationIndex,
    recommendationSource,
    recommendationPlatform,
    complianceSources,
    complianceReport,
    ddmSchemaId,
    mdmCommandSchemaId,
    undoStack,
    redoStack,
    setState,
    setSelection,
    setRawJsonState,
    setRawJsonDirty,
    setSelectedType,
    setNewPolicyName,
    setStatus,
    setIsDirty,
    setHasFreshBuild,
    setUndoStack,
    setRedoStack,
    setRulesetReport,
    setInspectorTab,
    setSelectedRecommendationId,
    setRecommendationSourceState,
    setRecommendationPlatform,
    setRecommendationQuery,
    setComplianceSources,
    setComplianceReport,
    setComplianceLoading,
    setComplianceError,
    setIsBuildLoading,
  });

  return {
    kind: "ready",
    controller: {
      state: currentState,
      selection,
      rawJson,
      rawJsonDirty,
      selectedType,
      addQuery,
      addGroup,
      inspectorTab,
      newPolicyPlatform,
      newPolicyName,
      keyValue,
      status,
      isDirty,
      isBuildLoading,
      hasFreshBuild,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      rulesetReport,
      recommendationIndex,
      recommendationCatalog,
      recommendationSource,
      recommendationQuery,
      recommendationPlatform,
      selectedRecommendationId,
      recommendationsLoading,
      recommendationsError,
      complianceSources,
      complianceReport,
      complianceLoading,
      complianceError,
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
      setSelection,
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
      setStatus,
      setRecommendationQuery,
      setRecommendationPlatform,
      setSelectedRecommendationId,
      setDdmSchemaId,
      setMdmCommandSchemaId,
      ...actions,
    },
  };
}

function useInitialEditorState(props: {
  readonly setLoadError: StateSetter<string | undefined>;
  readonly setState: StateSetter<AppState | undefined>;
  readonly setSelection: StateSetter<Selection | undefined>;
  readonly setRawJsonState: StateSetter<string>;
  readonly setRawJsonDirty: StateSetter<boolean>;
  readonly setHasFreshBuild: StateSetter<boolean>;
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
  setState: StateSetter<AppState | undefined>,
  setStatus: StateSetter<string>,
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
          setStatus(`Live validation failed: ${error instanceof Error ? error.message : String(error)}`);
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
  setRawJsonState: StateSetter<string>,
  setRawJsonDirty: StateSetter<boolean>,
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
  readonly setDdmSchemaId: StateSetter<string>;
  readonly setMdmCommandSchemaId: StateSetter<string>;
  readonly setNewPolicyPlatform: StateSetter<string>;
  readonly setSelectedType: StateSetter<string>;
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

function useRecommendationData(props: {
  readonly policy: WorkspacePolicy | undefined;
  readonly recommendationCatalog: RecommendationCatalogResponse | undefined;
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly recommendationSource: RecommendationSource;
  readonly recommendationSummary: RecommendationSourceSummary | undefined;
  readonly setRecommendationCatalogs: StateSetter<Partial<Record<RecommendationSource, RecommendationCatalogResponse>>>;
  readonly setRecommendationIndex: StateSetter<RecommendationIndexResponse | undefined>;
  readonly setRecommendationPlatform: StateSetter<string>;
  readonly setRecommendationsError: StateSetter<string | undefined>;
  readonly setRecommendationsLoading: StateSetter<boolean>;
}): void {
  useEffect(() => {
    if (props.recommendationIndex !== undefined) {
      return;
    }
    let cancelled = false;
    props.setRecommendationsLoading(true);
    props.setRecommendationsError(undefined);
    void fetch("/api/recommendations")
      .then(async (response) => {
        const result = await readJsonResponse<RecommendationIndexResponse>(response);
        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }
        if (!cancelled) {
          props.setRecommendationIndex(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          props.setRecommendationsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          props.setRecommendationsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.recommendationIndex, props.setRecommendationIndex, props.setRecommendationsError, props.setRecommendationsLoading]);

  useEffect(() => {
    if (props.recommendationCatalog !== undefined) {
      return;
    }
    let cancelled = false;
    props.setRecommendationsLoading(true);
    props.setRecommendationsError(undefined);
    void fetch(`/api/recommendations/${props.recommendationSource}`)
      .then(async (response) => {
        const result = await readJsonResponse<RecommendationCatalogResponse>(response);
        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }
        if (!cancelled) {
          props.setRecommendationCatalogs((current) => ({ ...current, [props.recommendationSource]: result }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          props.setRecommendationsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          props.setRecommendationsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.recommendationCatalog,
    props.recommendationSource,
    props.setRecommendationCatalogs,
    props.setRecommendationsError,
    props.setRecommendationsLoading,
  ]);

  useEffect(() => {
    if (props.recommendationSummary === undefined) {
      return;
    }
    const summary = props.recommendationSummary;
    props.setRecommendationPlatform((current) => {
      if (current !== ALL_RECOMMENDATION_PLATFORMS && summary.displayPlatforms.includes(current)) {
        return current;
      }
      const preferred = preferredRecommendationPlatform(summary, policyPlatform(props.policy));
      return preferred ?? ALL_RECOMMENDATION_PLATFORMS;
    });
  }, [props.policy, props.recommendationSummary, props.setRecommendationPlatform]);
}

function useComplianceReportRefresh(props: {
  readonly complianceSources: RecommendationSource[];
  readonly selection: Selection | undefined;
  readonly setComplianceError: StateSetter<string | undefined>;
  readonly setComplianceLoading: StateSetter<boolean>;
  readonly setComplianceReport: StateSetter<ComplianceReport | undefined>;
  readonly state: AppState | undefined;
}): void {
  useEffect(() => {
    if (props.state === undefined || props.selection === undefined || props.complianceSources.length === 0) {
      props.setComplianceReport(undefined);
      props.setComplianceError(undefined);
      props.setComplianceLoading(false);
      return;
    }
    const workspace = props.state.workspace;
    const selection = props.selection;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      props.setComplianceLoading(true);
      props.setComplianceError(undefined);
      void postJson("/api/compliance/check", {
        workspace,
        selection: {
          policyIndex: selection.policyIndex,
          versionIndex: selection.versionIndex,
        },
        sources: props.complianceSources,
      })
        .then(async (response) => {
          const result = await readJsonResponse<{ report?: ComplianceReport } & JsonRecord>(response);
          if (!response.ok || result.report === undefined) {
            throw new Error(JSON.stringify(result));
          }
          if (!cancelled) {
            props.setComplianceReport(result.report);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            props.setComplianceError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            props.setComplianceLoading(false);
          }
        });
    }, COMPLIANCE_REFRESH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    props.complianceSources,
    props.selection,
    props.setComplianceError,
    props.setComplianceLoading,
    props.setComplianceReport,
    props.state?.workspace,
  ]);
}
