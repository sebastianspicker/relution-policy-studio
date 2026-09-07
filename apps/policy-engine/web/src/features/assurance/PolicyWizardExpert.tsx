/** Renders expert baseline mapping controls for deliberate, reviewable overrides. */
import { useMemo, type JSX } from "react";
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { expertSettingMatches, toggleSetting } from "./policy-wizard-selection.js";
import { buildExpertRuleset } from "./policy-wizard-ruleset.js";
import { tierCoverage, tierWorkspaceCoverage } from "./policy-wizard-coverage.js";
import { ExpertSettingRow } from "./PolicyWizardExpertSetting.js";
import { ExpertSummary } from "./PolicyWizardExpertSummary.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function ExpertWizard(props: {
  readonly controller: EditorController;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly error: string | undefined;
  readonly query: string;
  readonly selectedSettingIds: readonly string[];
  readonly selectedSources: readonly string[];
  readonly tier: BaselineTemplateTier;
  readonly onQueryChange: (query: string) => void;
  readonly onSelectedSettingIdsChange: (ids: readonly string[]) => void;
}): JSX.Element {
  const selectedSet = useMemo(() => new Set(props.selectedSettingIds), [props.selectedSettingIds]);
  const selectedCoverage = useMemo(() => props.expertOptions === undefined ? undefined : tierCoverage(props.expertOptions.settings, selectedSet, props.selectedSources), [props.expertOptions, selectedSet, props.selectedSources]);
  const workspaceCoverage = useMemo(() => props.expertOptions === undefined ? undefined : tierWorkspaceCoverage(props.expertOptions.settings, props.controller.state.workspace, props.selectedSources), [props.expertOptions, props.controller.state.workspace, props.selectedSources]);
  const ruleset = useMemo(() => props.expertOptions === undefined ? undefined : buildExpertRuleset(props.expertOptions, props.tier, selectedSet, props.selectedSources), [props.expertOptions, props.tier, selectedSet, props.selectedSources]);
  if (props.error !== undefined) return <p className="error">{props.error}</p>;
  if (props.expertOptions === undefined || selectedCoverage === undefined || workspaceCoverage === undefined || ruleset === undefined) return <p className="loading-inline" aria-live="polite">Loading expert settings…</p>;
  const filteredSettings = props.expertOptions.settings.filter((setting) => expertSettingMatches(setting, props.query));
  const readyPolicyCount = ruleset.policies.length;

  return (
    <section className="policy-wizard-step" aria-labelledby="wizard-expert-heading">
      <div>
        <h3 id="wizard-expert-heading">3. Select settings</h3>
        <p>Use expert mode when you want exact settings and recommendation evidence before generation.</p>
      </div>
      <div className="policy-wizard-expert-layout">
        <ExpertSummary
          expertOptions={props.expertOptions}
          selectedSettingIds={props.selectedSettingIds}
          selectedSources={props.selectedSources}
          tier={props.tier}
          selectedCoverage={selectedCoverage}
          workspaceCoverage={workspaceCoverage}
          readyPolicyCount={readyPolicyCount}
          onSelectedSettingIdsChange={props.onSelectedSettingIdsChange}
          onApply={() => void props.controller.applyExpertBaselineSelection(ruleset)}
        />
        <div className="policy-wizard-expert-main">
          <label className="policy-wizard-search">
            Search settings
            <input name="expert-setting-search" type="search" autoComplete="off" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
          </label>
          <div className="policy-wizard-setting-list">
            {filteredSettings.length > 0 ? filteredSettings.map((setting) => (
              <ExpertSettingRow
                key={setting.id}
                setting={setting}
                checked={selectedSet.has(setting.id)}
                tier={props.tier}
                selectedSources={props.selectedSources}
                onChange={(checked) => props.onSelectedSettingIdsChange(toggleSetting(props.selectedSettingIds, setting.id, checked))}
              />
            )) : <p className="empty-state">No settings match the current search.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
