import { useState, type JSX } from "react";
import { CompliancePanel } from "./CompliancePanel.js";
import { PolicyWizardPanel } from "./PolicyWizardPanel.js";
import { RecommendationsPanel } from "./RecommendationsPanel.js";
import type { EditorController } from "./types.js";

type BaselineTab = "wizard" | "recommendations" | "compliance";

const BASELINE_TABS: readonly { readonly id: BaselineTab; readonly label: string }[] = [
  { id: "wizard", label: "Wizard" },
  { id: "recommendations", label: "Recommendations" },
  { id: "compliance", label: "Compliance" },
];

export function BaselinePanel({ controller }: { readonly controller: EditorController }): JSX.Element {
  const [tab, setTab] = useState<BaselineTab>("wizard");

  return (
    <div className="baseline-panel">
      <div className="baseline-tabs recommendation-source-switcher" role="tablist" aria-label="Baseline tools">
        {BASELINE_TABS.map((t) => (
          <button
            key={t.id}
            id={baselineTabId(t.id)}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={baselinePanelId(t.id)}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={baselinePanelId(tab)} role="tabpanel" aria-labelledby={baselineTabId(tab)}>
        {tab === "wizard" ? (
          <PolicyWizardPanel controller={controller} />
        ) : tab === "recommendations" ? (
          <RecommendationsPanel controller={controller} />
        ) : (
          <CompliancePanel controller={controller} />
        )}
      </div>
    </div>
  );
}

function baselineTabId(tab: BaselineTab): string {
  return `baseline-tab-${tab}`;
}

function baselinePanelId(tab: BaselineTab): string {
  return `baseline-panel-${tab}`;
}
