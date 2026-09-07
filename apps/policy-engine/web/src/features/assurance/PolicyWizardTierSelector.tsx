/** Renders accessible tier selection with roving keyboard focus. */
import { useMemo, type JSX, type RefObject } from "react";
import type { BaselineTemplateTier } from "../../../../src/browser/assurance.js";
import { TierButton } from "./PolicyWizardTierCard.js";
import { tierCardStates, type TierSelectorProps } from "./policy-wizard-tier-model.js";
import { useRovingFocus } from "../../shared/useRovingFocus.js";

export function TierSelector(props: TierSelectorProps): JSX.Element {
  const cards = useMemo(() => tierCardStates(props), [props.availableOptions, props.expertOptions, props.platform, props.shape, props.selectedSources]);
  const enabledTiers = cards.filter((card) => card.option !== undefined).map((card) => String(card.tier));
  const roving = useRovingFocus({
    active: String(props.tier),
    items: enabledTiers,
    onChange: (tier) => props.onTierChange(Number(tier) as BaselineTemplateTier),
  });
  return (
    <div ref={roving.containerRef as RefObject<HTMLDivElement | null>} className="policy-wizard-tier-grid" role="radiogroup" aria-label="Security tier">
      {cards.map((card) => (
        <TierButton
          key={card.tier}
          card={card}
          selected={props.tier === card.tier}
          onTierChange={props.onTierChange}
          {...(card.option === undefined ? {} : { rovingProps: roving.getItemProps(String(card.tier)) })}
        />
      ))}
    </div>
  );
}
