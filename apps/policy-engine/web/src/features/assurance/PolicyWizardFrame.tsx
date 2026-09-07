/** Provides common baseline-wizard headings, navigation, and status framing. */
import type { JSX } from "react";
import type {
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { platformLabel, shapeLabel } from "./policy-wizard-labels.js";

export type WizardMode = "guided" | "expert";

export function PolicyWizardHeader(props: {
  readonly optionsLoaded: boolean;
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly shape: BaselineTemplateShape;
}): JSX.Element {
  return (
    <header className="policy-wizard-header">
      <div>
        <h2>Baseline builder</h2>
        <p>Build a local workspace from exact BSI/CIS/vendor baseline templates.</p>
      </div>
      {props.optionsLoaded ? (
        <div className="policy-wizard-current" aria-label="Current wizard selection">
          <span>{platformLabel(props.platform)}</span>
          <span>Tier {props.tier}</span>
          <span>{shapeLabel(props.shape)}</span>
        </div>
      ) : null}
    </header>
  );
}

export function WizardModeTabs(props: {
  readonly mode: WizardMode;
  readonly onModeChange: (mode: WizardMode) => void;
}): JSX.Element {
  return (
    <div className="recommendation-source-switcher" role="tablist" aria-label="Builder mode">
      {(["guided", "expert"] as const).map((candidate) => (
        <button key={candidate} type="button" role="tab" aria-selected={props.mode === candidate} className={props.mode === candidate ? "active" : ""} onClick={() => props.onModeChange(candidate)}>
          {candidate === "guided" ? "Guided" : "Expert"}
        </button>
      ))}
    </div>
  );
}
