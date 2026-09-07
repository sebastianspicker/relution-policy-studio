/** Maps application sections to stable URL routes and resolves their primary destinations. */
import type { AppSection } from "../shared/application-sections.js";

export type SectionRoute =
  | "policies"
  | "baselines/builder"
  | "baselines/recommendations"
  | "baselines/compliance"
  | "device-audit"
  | "settings";

const DEFAULT_ROUTE: SectionRoute = "policies";
const SECTION_ROUTES = new Set<SectionRoute>([
  "policies",
  "baselines/builder",
  "baselines/recommendations",
  "baselines/compliance",
  "device-audit",
  "settings",
]);

const PRIMARY_ROUTE_BY_SECTION: Readonly<Record<AppSection, SectionRoute>> = {
  policies: "policies",
  baselines: "baselines/builder",
  "device-audit": "device-audit",
  settings: "settings",
};

function parseSectionRoute(hash: string): SectionRoute | undefined {
  const candidate = hash.replace(/^#\/?/u, "").replace(/^\/+|\/+$/gu, "");
  return SECTION_ROUTES.has(candidate as SectionRoute) ? candidate as SectionRoute : undefined;
}

function canonicalHashFor(route: SectionRoute): string {
  return `#/${route}`;
}

export function routeFromHash(hash: string): { readonly route: SectionRoute; readonly canonical: boolean } {
  const route = parseSectionRoute(hash);
  return { route: route ?? DEFAULT_ROUTE, canonical: route !== undefined && hash === canonicalHashFor(route) };
}

export function replaceWithCanonicalRoute(route: SectionRoute, location: Location = window.location): void {
  window.history.replaceState(null, "", `${location.pathname}${location.search}${canonicalHashFor(route)}`);
}

export function navigateToSectionRoute(route: SectionRoute, location: Location = window.location): void {
  if (location.hash !== canonicalHashFor(route)) {
    window.history.pushState(null, "", `${location.pathname}${location.search}${canonicalHashFor(route)}`);
  }
}

export function sectionForRoute(route: SectionRoute): AppSection {
  switch (route) {
    case "baselines/builder":
    case "baselines/recommendations":
    case "baselines/compliance":
      return "baselines";
    case "policies":
    case "device-audit":
    case "settings":
      return route;
  }
}

export function primaryRouteForSection(section: AppSection): SectionRoute {
  return PRIMARY_ROUTE_BY_SECTION[section];
}
