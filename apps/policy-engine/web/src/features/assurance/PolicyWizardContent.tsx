/** Selects the guided or expert wizard content while preserving shared template state. */
import type { JSX } from "react";
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateOption,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { RECOMMENDATION_SOURCES } from "../../../../src/browser/assurance.js";
import { platformLabel, shapeLabel, sourceLabel } from "./policy-wizard-labels.js";
import { ExpertWizard } from "./PolicyWizardExpert.js";
import { PolicyWizardGuided } from "./PolicyWizardGuided.js";
import { WizardModeTabs, type WizardMode } from "./PolicyWizardFrame.js";
import { TierSelector } from "./PolicyWizardTierSelector.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function PolicyWizardContent(props: {
  readonly availableOptions: readonly BaselineTemplateOption[];
  readonly controller: EditorController;
  readonly expertError: string | undefined;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly expertQuery: string;
  readonly mode: WizardMode;
  readonly platform: BaselineTemplatePlatform;
  readonly platformOptions: readonly BaselineTemplatePlatform[];
  readonly selectedOption: BaselineTemplateOption | undefined;
  readonly selectedSettingIds: readonly string[];
  readonly selectedSources: readonly string[];
  readonly shape: BaselineTemplateShape;
  readonly shapeOptions: readonly BaselineTemplateShape[];
  readonly tier: BaselineTemplateTier;
  readonly onExpertQueryChange: (query: string) => void;
  readonly onModeChange: (mode: WizardMode) => void;
  readonly onPlatformChange: (platform: BaselineTemplatePlatform) => void;
  readonly onSelectedSettingIdsChange: (ids: readonly string[]) => void;
  readonly onSelectedSourcesChange: (sources: readonly string[]) => void;
  readonly onShapeChange: (shape: BaselineTemplateShape) => void;
  readonly onTierChange: (tier: BaselineTemplateTier) => void;
}): JSX.Element {
  return (
    <>
      <WizardModeTabs mode={props.mode} onModeChange={props.onModeChange} />
      <section className="policy-wizard-step" aria-labelledby="wizard-scope-heading">
        <div>
          <h3 id="wizard-scope-heading">1. Scope</h3>
          <p>Choose the platform and whether the generated workspace is modular or consolidated.</p>
        </div>
        <WizardControls
          platform={props.platform}
          shape={props.shape}
          platformOptions={props.platformOptions}
          shapeOptions={props.shapeOptions}
          selectedSources={props.selectedSources}
          onPlatformChange={props.onPlatformChange}
          onShapeChange={props.onShapeChange}
          onSourcesChange={props.onSelectedSourcesChange}
        />
      </section>
      <section className="policy-wizard-step" aria-labelledby="wizard-tier-heading">
        <div>
          <h3 id="wizard-tier-heading">2. Security tier</h3>
          <p>Pick the baseline strength before previewing or selecting individual settings.</p>
        </div>
        <TierSelector
          availableOptions={props.availableOptions}
          expertOptions={props.expertOptions}
          platform={props.platform}
          shape={props.shape}
          tier={props.tier}
          selectedSources={props.selectedSources}
          onTierChange={props.onTierChange}
        />
      </section>
      {props.mode === "guided" ? (
        <PolicyWizardGuided
          selectedOption={props.selectedOption}
          expertOptions={props.expertOptions}
          platform={props.platform}
          tier={props.tier}
          shape={props.shape}
          selectedSources={props.selectedSources}
          controller={props.controller}
        />
      ) : (
        <ExpertWizard
          controller={props.controller}
          expertOptions={props.expertOptions}
          error={props.expertError}
          query={props.expertQuery}
          selectedSettingIds={props.selectedSettingIds}
          selectedSources={props.selectedSources}
          tier={props.tier}
          onQueryChange={props.onExpertQueryChange}
          onSelectedSettingIdsChange={props.onSelectedSettingIdsChange}
        />
      )}
    </>
  );
}

function WizardControls(props: {
  readonly platform: BaselineTemplatePlatform;
  readonly shape: BaselineTemplateShape;
  readonly platformOptions: readonly BaselineTemplatePlatform[];
  readonly shapeOptions: readonly BaselineTemplateShape[];
  readonly selectedSources: readonly string[];
  readonly onPlatformChange: (platform: BaselineTemplatePlatform) => void;
  readonly onShapeChange: (shape: BaselineTemplateShape) => void;
  readonly onSourcesChange: (sources: readonly string[]) => void;
}): JSX.Element {
  function sourceChange(source: string, checked: boolean): void {
    props.onSourcesChange(checked ? [...props.selectedSources, source] : props.selectedSources.filter((selected) => selected !== source));
  }

  return (
    <div className="recommendation-controls policy-wizard-controls">
      <label>
        Platform
        <select value={props.platform} onChange={(event) => props.onPlatformChange(event.target.value as BaselineTemplatePlatform)}>
          {props.platformOptions.map((candidate) => <option key={candidate} value={candidate}>{platformLabel(candidate)}</option>)}
        </select>
      </label>
      <label>
        Shape
        <select value={props.shape} onChange={(event) => props.onShapeChange(event.target.value as BaselineTemplateShape)}>
          {props.shapeOptions.map((candidate) => <option key={candidate} value={candidate}>{shapeLabel(candidate)}</option>)}
        </select>
      </label>
      <fieldset className="policy-wizard-sources">
        <legend>Sources</legend>
        {RECOMMENDATION_SOURCES.map((source) => (
          <label key={source} className="switch-control switch-control--compact">
            <input type="checkbox" checked={props.selectedSources.includes(source)} onChange={(event) => sourceChange(source, event.target.checked)} />
            <span>{sourceLabel(source)}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
