/** Renders one expert baseline setting with its source evidence and target values. */
import type { JSX } from "react";
import type { BaselineExpertMapping, BaselineExpertSetting, BaselineTemplateTier } from "../../../../src/browser/assurance.js";
import {
  effectiveMappings,
  effectiveRecommendations,
  effectiveTierMapping,
  settingMatchesSources,
} from "./policy-wizard-evidence.js";
import { formatMappingValue, sourceLabel } from "./policy-wizard-labels.js";

export function ExpertSettingRow(props: {
  readonly setting: BaselineExpertSetting;
  readonly checked: boolean;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const mappings = effectiveMappings(props.setting, props.tier);
  const sourceMatched = settingMatchesSources(props.setting, props.selectedSources, props.tier);
  const tierMapping = effectiveTierMapping(props.setting, props.tier);
  const policyName = tierMapping?.policyName ?? props.setting.policyName;
  const ruleTitle = tierMapping?.ruleTitle ?? props.setting.ruleTitle;
  const reason = tierMapping?.reason ?? props.setting.reason;
  const recommendations = effectiveRecommendations(props.setting, props.tier);
  return (
    <article className={["policy-wizard-setting", props.checked ? "selected" : "", !sourceMatched ? "policy-wizard-setting--source-muted" : ""].filter(Boolean).join(" ")}>
      <label className="checkbox-control">
        <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
        <span>
          <strong>{props.setting.label}</strong>
          <small>{policyName} | required in tiers {props.setting.requiredInTiers.join(", ")}</small>
          <span className="policy-wizard-setting-badges" aria-label="Recommendation sources">
            {recommendations.map((recommendation) => <span key={`${recommendation.source}:${recommendation.ruleId}`} className={props.selectedSources.includes(recommendation.source) ? "compliance-stat compliance-stat--unknown" : "compliance-stat compliance-stat--unknown policy-wizard-source-badge--inactive"}>{recommendation.source.toUpperCase()} {recommendation.ruleId}</span>)}
          </span>
        </span>
      </label>
      <details>
        <summary>Recommendations and values</summary>
        {reason !== undefined ? <p>{reason}</p> : null}
        <dl className="preview-summary">
          <div><dt>Rule</dt><dd>{ruleTitle}</dd></div>
          <div><dt>Target</dt><dd>{mappings.map((mapping) => mapping.target).join(", ")}</dd></div>
          <div><dt>Values</dt><dd><MappingValues mappings={mappings} /></dd></div>
        </dl>
        <SourceRecommendationList recommendations={recommendations} selectedSources={props.selectedSources} />
      </details>
    </article>
  );
}

function SourceRecommendationList({ recommendations, selectedSources }: {
  readonly recommendations: BaselineExpertSetting["recommendations"];
  readonly selectedSources: readonly string[];
}): JSX.Element {
  return (
    <div className="policy-wizard-module-list" aria-label="Source recommendation evidence">
      <strong>Source recommendations</strong>
      <ul>{recommendations.map((recommendation) => (
        <li key={`${recommendation.source}:${recommendation.ruleId}`} className={selectedSources.includes(recommendation.source) ? "" : "policy-wizard-source-badge--inactive"}>
          <span>{sourceLabel(recommendation.source)} {recommendation.ruleId}: {recommendation.title}</span>
          {recommendation.reason !== undefined ? <small>{recommendation.reason}</small> : null}
        </li>
      ))}</ul>
    </div>
  );
}

function MappingValues({ mappings }: { readonly mappings: readonly BaselineExpertMapping[] }): JSX.Element {
  const entries = mappings.flatMap((mapping) => Object.entries(mapping.values).map(([key, value]) => ({ key: `${mapping.target}:${key}`, label: key, value })));
  if (entries.length === 0) return <span className="policy-wizard-muted">No values for this tier.</span>;
  return (
    <table className="policy-wizard-value-table"><tbody>
      {entries.map((entry) => <tr key={entry.key}><th scope="row">{entry.label}</th><td><code>{formatMappingValue(entry.value)}</code></td></tr>)}
    </tbody></table>
  );
}
