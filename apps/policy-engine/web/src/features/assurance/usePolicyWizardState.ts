/** Owns baseline-wizard selections and asynchronous option state outside the presentation panel. */
import { useEffect, useMemo, useState } from "react";
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateOption,
  BaselineTemplateOptionsResponse,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { RECOMMENDATION_SOURCES } from "../../../../src/browser/assurance.js";
import { selectedBaselineOption } from "./policy-wizard-option-selection.js";
import { presetSettingIds } from "./policy-wizard-selection.js";
import { useBaselineExpertOptions, useBaselineTemplateOptions, tierOptionsFor } from "./PolicyWizardPanel.data.js";
import type { WizardMode } from "./PolicyWizardFrame.js";

export interface PolicyWizardState {
  readonly availableOptions: readonly BaselineTemplateOption[];
  readonly expertError: string | undefined;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly expertQuery: string;
  readonly loadError: string | undefined;
  readonly mode: WizardMode;
  readonly options: BaselineTemplateOptionsResponse | undefined;
  readonly platform: BaselineTemplatePlatform;
  readonly selectedOption: BaselineTemplateOption | undefined;
  readonly selectedSettingIds: readonly string[];
  readonly selectedSources: readonly string[];
  readonly shape: BaselineTemplateShape;
  readonly tier: BaselineTemplateTier;
  readonly chooseTier: (tier: BaselineTemplateTier) => void;
  readonly setExpertQuery: (query: string) => void;
  readonly setMode: (mode: WizardMode) => void;
  readonly setPlatform: (platform: BaselineTemplatePlatform) => void;
  readonly setSelectedSettingIds: (ids: readonly string[]) => void;
  readonly setSelectedSources: (sources: readonly string[]) => void;
  readonly setShape: (shape: BaselineTemplateShape) => void;
}

export function usePolicyWizardState(): PolicyWizardState {
  const [mode, setMode] = useState<WizardMode>("guided");
  const [platform, setPlatform] = useState<BaselineTemplatePlatform>("IOS");
  const [tier, setTier] = useState<BaselineTemplateTier>(3);
  const [shape, setShape] = useState<BaselineTemplateShape>("modules");
  const [selectedSettingIds, setSelectedSettingIds] = useState<readonly string[]>([]);
  const [expertQuery, setExpertQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<readonly string[]>(RECOMMENDATION_SOURCES.slice());
  const { loadError, options } = useBaselineTemplateOptions(platform, setPlatform);
  const { expertError, expertOptions } = useBaselineExpertOptions(platform, shape);

  useEffect(() => {
    if (expertOptions !== undefined) {
      setSelectedSettingIds(presetSettingIds(expertOptions.settings, tier, selectedSources));
    }
  }, [expertOptions, selectedSources, tier]);

  const availableOptions = options?.options ?? [];
  const selectedOption = selectedBaselineOption(availableOptions, platform, tier, shape);
  const tierOptions = useMemo(() => tierOptionsFor(availableOptions, platform, shape), [availableOptions, platform, shape]);

  useEffect(() => {
    if (tierOptions.length > 0 && !tierOptions.includes(tier)) {
      setTier(tierOptions[0] ?? 3);
    }
  }, [tier, tierOptions]);

  function chooseTier(nextTier: BaselineTemplateTier): void {
    setTier(nextTier);
    if (mode === "expert" && expertOptions !== undefined) {
      setSelectedSettingIds(presetSettingIds(expertOptions.settings, nextTier, selectedSources));
    }
  }

  return {
    availableOptions,
    chooseTier,
    expertError,
    expertOptions,
    expertQuery,
    loadError,
    mode,
    options,
    platform,
    selectedOption,
    selectedSettingIds,
    selectedSources,
    setExpertQuery,
    setMode,
    setPlatform,
    setSelectedSettingIds,
    setSelectedSources,
    setShape,
    shape,
    tier,
  };
}
