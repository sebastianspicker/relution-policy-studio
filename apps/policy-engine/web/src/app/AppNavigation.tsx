/** Renders primary section navigation with the active route represented semantically. */
import type { JSX } from "react";
import { IconBaseline, IconDashboard, IconPolicies, IconSettings } from "../ui/icons.js";
import { primaryRouteForSection, type SectionRoute } from "./SectionRoute.js";
import type { AppSection } from "../shared/application-sections.js";

type NavigationItem = {
  readonly section: AppSection;
  readonly label: string;
  readonly Icon: (props: { size?: number }) => JSX.Element;
};

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { section: "policies", label: "Policies", Icon: IconPolicies },
  { section: "baselines", label: "Baselines", Icon: IconBaseline },
  { section: "device-audit", label: "Device audit", Icon: IconDashboard },
  { section: "settings", label: "Settings", Icon: IconSettings },
];

const isHostedDemo = import.meta.env.MODE === "demo";

export function AppNavigation(props: {
  readonly section: AppSection;
  readonly onNavigate: (route: SectionRoute) => void;
}): JSX.Element {
  return (
    <>
      <nav className="app-rail" aria-label="App sections">
        <div className="app-rail-brand" aria-label="REXP Studio">
          <span className="app-rail-brand-mark" aria-hidden="true">RX</span>
          <span className="app-rail-brand-name">REXP <span className="app-rail-brand-product">Studio</span></span>
        </div>
        <NavigationItems {...props} className="app-rail-btn" />
        <div className="app-rail-local" aria-label={isHostedDemo ? "Hosted demo · in memory" : "Local workspace · loopback"}>
          <span className="app-rail-local-status" aria-hidden="true" />
          <span className="app-rail-local-label">{isHostedDemo ? "Demo · in memory" : "Local · loopback"}</span>
        </div>
      </nav>
      <nav className="mobile-section-controls" aria-label="App sections">
        <NavigationItems {...props} className="mobile-section-btn" />
      </nav>
    </>
  );
}

function NavigationItems(props: {
  readonly className: string;
  readonly section: AppSection;
  readonly onNavigate: (route: SectionRoute) => void;
}): JSX.Element {
  return (
    <>
      {NAVIGATION_ITEMS.map((item) => (
        <button
          key={item.section}
          type="button"
          className={props.className}
          aria-current={props.section === item.section ? "page" : undefined}
          title={item.label}
          onClick={() => props.onNavigate(primaryRouteForSection(item.section))}
        >
          <span className="app-rail-icon" aria-hidden="true">
            <item.Icon size={20} />
          </span>
          <span className="app-rail-label">{item.label}</span>
        </button>
      ))}
    </>
  );
}
