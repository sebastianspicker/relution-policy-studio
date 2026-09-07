/** Combines baseline building, recommendations, and compliance into one tabbed review surface. */
import { deferredComponent } from "../../ui/deferred-component.js";
import { useState, type JSX } from "react";
import { SectionHeader } from "../../ui/SectionHeader.js";
import { StatusChip } from "../../ui/StatusChip.js";
import type { EditorController } from "../../shared/editor-contracts.js";

const CompliancePanel = deferredComponent(() => import("./CompliancePanel.js").then((module) => ({ default: module.CompliancePanel })));
const PolicyWizardPanel = deferredComponent(() => import("./PolicyWizardPanel.js").then((module) => ({ default: module.PolicyWizardPanel })));
const RecommendationsPanel = deferredComponent(() => import("./RecommendationsPanel.js").then((module) => ({ default: module.RecommendationsPanel })));

export type BaselineTab = "wizard" | "recommendations" | "compliance";

const BASELINE_TABS: readonly { readonly id: BaselineTab; readonly label: string }[] = [
  { id: "wizard", label: "Builder" },
  { id: "recommendations", label: "Recommendations" },
  { id: "compliance", label: "Compliance" },
];

export function BaselinePanel({ controller, activeTab, onTabChange }: {
  readonly controller: EditorController;
  readonly activeTab?: BaselineTab;
  readonly onTabChange?: (tab: BaselineTab) => void;
}): JSX.Element {
  const [uncontrolledTab, setUncontrolledTab] = useState<BaselineTab>("wizard");
  const tab = activeTab ?? uncontrolledTab;

  function selectTab(nextTab: BaselineTab): void {
    setUncontrolledTab(nextTab);
    onTabChange?.(nextTab);
  }

  return (
    <div className="baseline-workspace">
      <SectionHeader
        title="Baselines"
        description="Build policies from available guidance, review recommendations, and compare the current workspace."
        meta={<StatusChip kind="info">{BASELINE_TABS.find((item) => item.id === tab)?.label ?? "Builder"}</StatusChip>}
      />
      <div className="baseline-workspace-surface">
        <div className="baseline-tabs" role="tablist" aria-label="Baseline tools">
          {BASELINE_TABS.map((item, index) => (
            <button
              key={item.id}
              id={baselineTabId(item.id)}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={baselinePanelId(item.id)}
              className={tab === item.id ? "active" : ""}
              onClick={() => selectTab(item.id)}
            >
              <span aria-hidden="true">{index + 1}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div
          className="baseline-workspace-panel"
          id={baselinePanelId(tab)}
          role="tabpanel"
          aria-labelledby={baselineTabId(tab)}
        >
          {tab === "wizard" ? (
            <PolicyWizardPanel controller={controller} />
          ) : tab === "recommendations" ? (
            <RecommendationsPanel controller={controller} />
          ) : (
            <CompliancePanel controller={controller} />
          )}
        </div>
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
