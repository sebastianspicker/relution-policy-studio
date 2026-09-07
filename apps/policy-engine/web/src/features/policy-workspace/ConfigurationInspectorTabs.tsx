/** Renders the inspector tablist with arrow, Home, and End navigation. */
import { useRef, type JSX, type KeyboardEvent } from "react";
import { IconCheck, IconCode, IconEye, IconLayers } from "../../ui/icons.js";
import type { InspectorTab } from "../../shared/editor-contracts.js";

const INSPECTOR_TABS = [
  { id: "validation", label: "Validation", Icon: IconCheck, short: "Validation" },
  { id: "preview", label: "Preview", Icon: IconEye, short: "Preview" },
  { id: "json", label: "JSON", Icon: IconCode, short: "JSON" },
  { id: "sidecar", label: "Artifacts", Icon: IconLayers, short: "Files" },
] as const satisfies readonly { readonly id: InspectorTab; readonly label: string; readonly Icon: (props: { size?: number }) => JSX.Element; readonly short: string }[];

export function ConfigurationInspectorTabs(props: {
  readonly active: InspectorTab;
  readonly onChange: (tab: InspectorTab) => void;
}): JSX.Element {
  const tablistRef = useRef<HTMLElement>(null);
  function handleKeyDown(event: KeyboardEvent, current: InspectorTab): void {
    const next = nextInspectorTab(current, event.key);
    if (next === undefined) return;
    event.preventDefault();
    props.onChange(next);
    tablistRef.current?.querySelector<HTMLElement>(`#${inspectorTabId(next)}`)?.focus();
  }
  return (
    <nav ref={tablistRef} className="inspector-sidebar" role="tablist" aria-label="Inspector panels" aria-orientation="horizontal">
      {INSPECTOR_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          id={inspectorTabId(tab.id)}
          role="tab"
          tabIndex={props.active === tab.id ? 0 : -1}
          aria-selected={props.active === tab.id}
          aria-controls={inspectorPanelId(tab.id)}
          className={props.active === tab.id ? "active" : ""}
          onClick={() => props.onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, tab.id)}
          title={tab.label}
          aria-label={tab.label}
        >
          <span className="inspector-tab-icon" aria-hidden="true"><tab.Icon size={18} /></span>
          <span className="inspector-tab-short" aria-hidden="true">{tab.short}</span>
        </button>
      ))}
    </nav>
  );
}

function nextInspectorTab(current: InspectorTab, key: string): InspectorTab | undefined {
  const ids = INSPECTOR_TABS.map((tab) => tab.id);
  const currentIndex = ids.indexOf(current);
  if (key === "ArrowRight" || key === "ArrowDown") return ids[(currentIndex + 1) % ids.length];
  if (key === "ArrowLeft" || key === "ArrowUp") return ids[(currentIndex - 1 + ids.length) % ids.length];
  if (key === "Home") return ids[0];
  if (key === "End") return ids.at(-1);
  return undefined;
}

export function inspectorTabId(tab: InspectorTab): string {
  return `inspector-tab-${tab}`;
}

export function inspectorPanelId(tab: InspectorTab): string {
  return `inspector-panel-${tab}`;
}
