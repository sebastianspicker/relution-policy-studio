/** Synchronizes shell navigation with canonical hash routes. */
import { useEffect, useState } from "react";
import type { BaselineTab } from "../features/assurance/BaselinePanel.js";
import { navigateToSectionRoute, replaceWithCanonicalRoute, routeFromHash, sectionForRoute, type SectionRoute } from "./SectionRoute.js";

export function useEditorShellRoute(setCompactPane: (pane: "editor") => void): {
  readonly appSection: ReturnType<typeof sectionForRoute>;
  readonly baselineTab: BaselineTab;
  readonly navigate: (route: SectionRoute) => void;
} {
  const [route, setRoute] = useState<SectionRoute>(() => resolveRouteFromHash());

  useEffect(() => {
    function syncRouteFromHistory(): void {
      setRoute(resolveRouteFromHash());
      setCompactPane("editor");
    }
    window.addEventListener("hashchange", syncRouteFromHistory);
    window.addEventListener("popstate", syncRouteFromHistory);
    return () => {
      window.removeEventListener("hashchange", syncRouteFromHistory);
      window.removeEventListener("popstate", syncRouteFromHistory);
    };
  }, [setCompactPane]);

  function navigate(nextRoute: SectionRoute): void {
    navigateToSectionRoute(nextRoute);
    setRoute(nextRoute);
    setCompactPane("editor");
  }

  return { appSection: sectionForRoute(route), baselineTab: baselineTabForRoute(route), navigate };
}

function resolveRouteFromHash(): SectionRoute {
  const resolved = routeFromHash(window.location.hash);
  if (!resolved.canonical) replaceWithCanonicalRoute(resolved.route);
  return resolved.route;
}

function baselineTabForRoute(route: SectionRoute): BaselineTab {
  if (route === "baselines/recommendations") return "recommendations";
  if (route === "baselines/compliance") return "compliance";
  return "wizard";
}
