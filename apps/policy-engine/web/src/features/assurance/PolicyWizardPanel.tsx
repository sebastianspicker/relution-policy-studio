/** Coordinates baseline wizard mode, selections, and template application workflow. */
import type { JSX } from "react";
import { PolicyWizardContent } from "./PolicyWizardContent.js";
import { PolicyWizardHeader } from "./PolicyWizardFrame.js";
import type { EditorController } from "../../shared/editor-contracts.js";
import { usePolicyWizardState } from "./usePolicyWizardState.js";

export function PolicyWizardPanel({ controller }: { readonly controller: EditorController }): JSX.Element {
  const state = usePolicyWizardState();

  return (
    <div className="inspector-content policy-wizard">
      <PolicyWizardHeader optionsLoaded={state.options !== undefined} platform={state.platform} tier={state.tier} shape={state.shape} />
      {state.loadError !== undefined ? <p className="error">{state.loadError}</p> : null}
      {state.options === undefined && state.loadError === undefined ? <p className="loading-inline" aria-live="polite">Loading baseline templates…</p> : null}
      {state.options !== undefined ? (
        <PolicyWizardContent
          availableOptions={state.availableOptions}
          controller={controller}
          expertError={state.expertError}
          expertOptions={state.expertOptions}
          expertQuery={state.expertQuery}
          mode={state.mode}
          platform={state.platform}
          platformOptions={state.options.platforms}
          selectedOption={state.selectedOption}
          selectedSettingIds={state.selectedSettingIds}
          selectedSources={state.selectedSources}
          shape={state.shape}
          shapeOptions={state.options.shapes}
          tier={state.tier}
          onExpertQueryChange={state.setExpertQuery}
          onModeChange={state.setMode}
          onPlatformChange={state.setPlatform}
          onSelectedSettingIdsChange={state.setSelectedSettingIds}
          onSelectedSourcesChange={state.setSelectedSources}
          onShapeChange={state.setShape}
          onTierChange={state.chooseTier}
        />
      ) : null}
    </div>
  );
}
