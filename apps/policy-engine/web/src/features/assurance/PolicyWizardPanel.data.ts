/** Fetches and derives baseline-template data while keeping asynchronous wizard state isolated. */
import { useEffect, useState } from "react";
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateOption,
  BaselineTemplateOptionsResponse,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { requestPolicyWizardData } from "./policy-wizard-data-request.js";

/** Cancels late option responses so an unmounted wizard cannot update editor state. */
export function useBaselineTemplateOptions(
  platform: BaselineTemplatePlatform,
  setPlatform: (platform: BaselineTemplatePlatform) => void,
): {
  readonly loadError: string | undefined;
  readonly options: BaselineTemplateOptionsResponse | undefined;
} {
  const [options, setOptions] = useState<BaselineTemplateOptionsResponse | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();

  useEffect(() => {
    return requestPolicyWizardData<BaselineTemplateOptionsResponse>(
      "/api/baseline-templates",
      (result) => {
        setOptions(result);
        selectAvailablePlatform(result, platform, setPlatform);
      },
      setLoadError,
    );
  }, []);

  return { loadError, options };
}

/** Reloads expert mappings for the current platform and shape, discarding stale responses. */
export function useBaselineExpertOptions(
  platform: BaselineTemplatePlatform,
  shape: BaselineTemplateShape,
): {
  readonly expertError: string | undefined;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
} {
  const [expertOptions, setExpertOptions] = useState<BaselineExpertOptionsResponse | undefined>();
  const [expertError, setExpertError] = useState<string | undefined>();

  useEffect(() => {
    setExpertOptions(undefined);
    setExpertError(undefined);
    const params = new URLSearchParams({ platform, shape });
    return requestPolicyWizardData<BaselineExpertOptionsResponse>(
      `/api/baseline-templates/expert?${params.toString()}`,
      setExpertOptions,
      setExpertError,
    );
  }, [platform, shape]);

  return { expertError, expertOptions };
}

export function tierOptionsFor(
  options: readonly BaselineTemplateOption[],
  platform: BaselineTemplatePlatform,
  shape: BaselineTemplateShape,
): BaselineTemplateTier[] {
  const tiers = options
    .filter((candidate) => candidate.platform === platform && candidate.shape === shape)
    .map((candidate) => candidate.tier);
  return [...new Set(tiers)].sort();
}

function selectAvailablePlatform(
  options: BaselineTemplateOptionsResponse,
  platform: BaselineTemplatePlatform,
  setPlatform: (platform: BaselineTemplatePlatform) => void,
): void {
  const selectedPlatform = options.platforms.includes(platform) ? platform : options.platforms[0];
  if (selectedPlatform !== undefined) {
    setPlatform(selectedPlatform);
  }
}
