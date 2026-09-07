/** Renders one accessible baseline tier card and its metadata. */
import type { JSX, KeyboardEventHandler } from "react";
import type { BaselineTemplateOption, BaselineTemplateTier } from "../../../../src/browser/assurance.js";
import type { TierCardState } from "./policy-wizard-tier-model.js";

export function TierButton(props: {
  readonly card: TierCardState;
  readonly selected: boolean;
  readonly onTierChange: (tier: BaselineTemplateTier) => void;
  readonly rovingProps?: { readonly tabIndex: 0 | -1; readonly onKeyDown: KeyboardEventHandler<HTMLElement> };
}): JSX.Element {
  return (
    <button
      type="button"
      className="policy-wizard-tier"
      aria-checked={props.selected}
      role="radio"
      data-roving-value={String(props.card.tier)}
      tabIndex={props.rovingProps?.tabIndex ?? -1}
      onKeyDown={props.rovingProps?.onKeyDown}
      disabled={props.card.option === undefined}
      onClick={() => props.onTierChange(props.card.tier)}
    >
      <TierButtonTitle card={props.card} />
      {props.card.option === undefined ? null : <TierButtonDetails card={props.card} option={props.card.option} />}
    </button>
  );
}

function TierButtonTitle({ card }: { readonly card: TierCardState }): JSX.Element {
  return (
    <span className="policy-wizard-tier-title">
      <strong>Tier {card.tier}</strong>
      {card.option === undefined
        ? <span>Unavailable</span>
        : card.showFiltered
          ? <span>{card.filteredRuleCount} <span className="policy-wizard-tier-total">/ {card.option.ruleCount} rules</span></span>
          : <span>{card.option.ruleCount} rules</span>}
    </span>
  );
}

function TierButtonDetails(props: { readonly card: TierCardState; readonly option: BaselineTemplateOption }): JSX.Element {
  return (
    <>
      <small>{props.option.stakeholderExamples.join(", ")}</small>
      <span className="policy-wizard-tier-meta">
        <span>{props.card.policyCount} {props.card.policyCount === 1 ? "policy" : "policies"}</span>
        <span>{props.option.actionableRuleCount} actionable</span>
        {props.option.suppressedConflictRuleCount > 0
          ? <span title="Source rules dropped due to irreconcilable conflicts">{props.option.suppressedConflictRuleCount} conflicts resolved</span>
          : null}
      </span>
      {props.card.moduleNames !== undefined && props.card.moduleNames.length > 0 ? (
        <span className="policy-wizard-tier-modules" aria-label="Policy modules">
          {props.card.moduleNames.map((name) => <span key={name} className="policy-wizard-tier-module">{name}</span>)}
        </span>
      ) : null}
    </>
  );
}
