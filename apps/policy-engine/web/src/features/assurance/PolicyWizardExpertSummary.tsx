/** Renders expert baseline coverage, bulk selection, and apply controls. */
import type { JSX } from "react";
import type { BaselineExpertOptionsResponse, BaselineTemplateTier } from "../../../../src/browser/assurance.js";
import { settingMatchesSources } from "./policy-wizard-evidence.js";
import { presetSettingIds } from "./policy-wizard-selection.js";
import type { TierCoverage } from "./policy-wizard-coverage.js";
import { WizardActionBar } from "./PolicyWizardGuided.js";

export function ExpertSummary(props: {
  readonly expertOptions: BaselineExpertOptionsResponse;
  readonly selectedSettingIds: readonly string[];
  readonly selectedSources: readonly string[];
  readonly tier: BaselineTemplateTier;
  readonly selectedCoverage: readonly TierCoverage[];
  readonly workspaceCoverage: readonly TierCoverage[];
  readonly readyPolicyCount: number;
  readonly onSelectedSettingIdsChange: (ids: readonly string[]) => void;
  readonly onApply: () => void;
}): JSX.Element {
  const selectedCount = props.selectedSettingIds.length;
  return (
    <aside className="policy-wizard-expert-summary" aria-label="Expert selection summary">
      <div className="policy-wizard-selection-count" aria-label={`${selectedCount} of ${props.expertOptions.settings.length} settings selected`} aria-live="polite">
        <strong>{selectedCount}</strong><span>of {props.expertOptions.settings.length} settings selected</span>
      </div>
      <div className="policy-wizard-coverage" aria-label="Expert coverage">
        <CoverageGroup title="Selected baseline coverage" coverage={props.selectedCoverage} />
        <CoverageGroup title="Current workspace compliance" coverage={props.workspaceCoverage} />
      </div>
      <div className="policy-wizard-bulk-actions" aria-label="Selection actions">
        <button type="button" onClick={() => props.onSelectedSettingIdsChange(presetSettingIds(props.expertOptions.settings, props.tier, props.selectedSources))}>Select tier {props.tier}</button>
        <button type="button" onClick={() => props.onSelectedSettingIdsChange(props.expertOptions.settings.filter((setting) => settingMatchesSources(setting, props.selectedSources, props.tier)).map((setting) => setting.id))}>Select all</button>
        <button type="button" onClick={() => props.onSelectedSettingIdsChange([])}>Clear</button>
      </div>
      <WizardActionBar
        actionLabel="Replace workspace with expert selection"
        disabled={props.readyPolicyCount === 0}
        disabledReason="Select at least one source-backed setting before applying an expert baseline."
        summary={props.readyPolicyCount === 0 ? "No settings selected" : `${selectedCount} settings, ${props.readyPolicyCount} policies ready`}
        onApply={props.onApply}
      />
    </aside>
  );
}

function CoverageGroup({ title, coverage }: { readonly title: string; readonly coverage: readonly TierCoverage[] }): JSX.Element {
  return (
    <section className="policy-wizard-coverage-group">
      <h3>{title}</h3>
      <div className="policy-wizard-coverage-list">
        {coverage.map((entry) => <div key={entry.tier} className="policy-wizard-coverage-row"><span>Tier {entry.tier}</span><meter min={0} max={100} value={entry.percent} aria-label={`Tier ${entry.tier} coverage`} /><strong>{entry.percent}%</strong><small>{entry.matched}/{entry.total}</small></div>)}
      </div>
    </section>
  );
}
