import { useEffect, useRef, useState, type JSX } from "react";
import type {
  BsiRecommendationRecord,
  CisRecommendationRecord,
  RecommendationImplementation,
  RecommendationRecord,
  RecommendationSource,
  RecommendationSourceSummary,
  VendorRecommendationRecord,
} from "../../../src/recommendation-types.js";
import { uniqueStrings } from "../../../src/utils/json-guards.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";
import { FallbackTranslationsSection } from "./FallbackTranslationsSection.js";
import { CisRecommendationSummaryDetail, VendorRecommendationDetail } from "./RecommendationDetails.js";
import { BsiDetail } from "./RecommendationsBsiDetail.js";
import type { EditorController } from "./types.js";

const ALL_RECOMMENDATION_PLATFORMS = "ALL";
const ALL_ACHIEVABILITY = "ALL";
const ALL_SURFACES = "ALL";
const RECOMMENDATION_SCOPE_ACTIONABLE = "actionable-settings";
const RECOMMENDATION_SCOPE_WITHOUT_SETTINGS = "recommendations-without-settings";
const RECOMMENDATION_SCOPE_ALL = "all-recommendations";

type RecommendationScope =
  | typeof RECOMMENDATION_SCOPE_ACTIONABLE
  | typeof RECOMMENDATION_SCOPE_WITHOUT_SETTINGS
  | typeof RECOMMENDATION_SCOPE_ALL;

export function RecommendationsPanel({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const [achievabilityFilter, setAchievabilityFilter] = useState(ALL_ACHIEVABILITY);
  const [surfaceFilter, setSurfaceFilter] = useState(ALL_SURFACES);
  const [recommendationScope, setRecommendationScope] = useState<RecommendationScope>(RECOMMENDATION_SCOPE_ACTIONABLE);
  const catalog = c.recommendationCatalog;
  useEffect(() => {
    setAchievabilityFilter(ALL_ACHIEVABILITY);
    setSurfaceFilter(ALL_SURFACES);
    setRecommendationScope(RECOMMENDATION_SCOPE_ACTIONABLE);
  }, [c.recommendationSource]);
  const view = recommendationViewState(c, recommendationScope, achievabilityFilter, surfaceFilter);
  const importDisabled = !canImportRuleset(catalog, c.recommendationPlatform);
  useEffect(() => {
    if (c.selectedRecommendationId !== undefined && view.selectedRecommendation === undefined) {
      c.setSelectedRecommendationId(undefined);
    }
  }, [c, view.selectedRecommendation]);

  return (
    <div className="inspector-content recommendations-panel">
      <h2>Recommendations</h2>
      <RecommendationSourceTabs controller={c} sources={view.sources} />
      <section id={recommendationPanelId(c.recommendationSource)} role="tabpanel" aria-labelledby={recommendationTabId(c.recommendationSource)}>
        {view.summary !== undefined ? (
          <>
            <p className="status recommendation-summary">
              {view.summary.label} | {view.summary.recommendationCount} recommendations | verified {view.summary.verifiedAsOf ?? "unknown"}
            </p>
            <p className="status recommendation-summary">
              Exact {view.sourceCoverage.exactMappings} | Actionable {view.sourceCoverage.actionableRecommendations} | Partial {view.sourceCoverage.partialRecommendations} | Helper {view.sourceCoverage.helperOnlyRecommendations} | Gap {view.sourceCoverage.gapRecommendations}
            </p>
            <p className="status recommendation-summary">
              Showing {scopeLabel(view.effectiveRecommendationScope)}: {view.filteredRecommendations.length} of {view.scopedRecommendations.length} scoped recommendations
            </p>
            <CoverageDisclosure coverage={view.filteredCoverage} total={view.filteredRecommendations.length} platform={c.recommendationPlatform} />
          </>
        ) : null}
        {c.recommendationsError !== undefined ? <p className="error">{c.recommendationsError}</p> : null}
        {view.summary === undefined || c.recommendationsLoading ? <p className="loading-inline" aria-live="polite">Loading recommendation catalog…</p> : null}
        {view.summary !== undefined && !c.recommendationsLoading ? (
          <>
            <div className="recommendation-controls">
              <label>
                Scope
                <select value={view.effectiveRecommendationScope} onChange={(event) => setRecommendationScope(event.target.value as RecommendationScope)}>
                  <option value={RECOMMENDATION_SCOPE_ACTIONABLE}>Actionable settings</option>
                  <option value={RECOMMENDATION_SCOPE_WITHOUT_SETTINGS}>Recommendations without settings</option>
                  <option value={RECOMMENDATION_SCOPE_ALL}>All recommendations</option>
                </select>
              </label>
              <label>
                Search
                <input type="search" value={c.recommendationQuery} onChange={(event) => c.setRecommendationQuery(event.target.value)} />
              </label>
              <label>
                Platform
                <select value={c.recommendationPlatform} onChange={(event) => c.setRecommendationPlatform(event.target.value)}>
                  <option value={ALL_RECOMMENDATION_PLATFORMS}>All</option>
                  {view.summary.displayPlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Achievability
                <select value={achievabilityFilter} onChange={(event) => setAchievabilityFilter(event.target.value)}>
                  <option value={ALL_ACHIEVABILITY}>All</option>
                  {view.availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Surface
                <select value={surfaceFilter} onChange={(event) => setSurfaceFilter(event.target.value)}>
                  <option value={ALL_SURFACES}>All</option>
                  {view.availableSurfaces.map((surface) => (
                    <option key={surface} value={surface}>
                      {surfaceLabel(surface)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={importDisabled} onClick={() => void c.importRecommendationRuleset()}>
                Import actionable settings
              </button>
            </div>
            {catalog === undefined ? null : !catalog.available ? (
              <p className="warning">{catalog.error ?? `${catalog.label} recommendations are unavailable.`}</p>
            ) : view.selectedRecommendation === undefined ? (
              <RecommendationList
                recommendations={view.filteredRecommendations}
                source={c.recommendationSource}
                onSelect={(recommendationId) => c.setSelectedRecommendationId(recommendationId)}
              />
            ) : (
              <RecommendationDetail
                summary={view.summary}
                source={c.recommendationSource}
                recommendation={view.selectedRecommendation}
                onBack={() => c.setSelectedRecommendationId(undefined)}
              />
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

interface RecommendationViewState {
  readonly availableCategories: readonly string[];
  readonly availableSurfaces: readonly string[];
  readonly effectiveRecommendationScope: RecommendationScope;
  readonly filteredCoverage: ReturnType<typeof summarizeCoverage>;
  readonly filteredRecommendations: RecommendationRecord[];
  readonly scopedRecommendations: RecommendationRecord[];
  readonly selectedRecommendation: RecommendationRecord | undefined;
  readonly sourceCoverage: ReturnType<typeof summarizeCoverage>;
  readonly sources: readonly RecommendationSourceSummary[];
  readonly summary: RecommendationSourceSummary | undefined;
}

function recommendationViewState(
  controller: EditorController,
  recommendationScope: RecommendationScope,
  achievabilityFilter: string,
  surfaceFilter: string,
): RecommendationViewState {
  const catalogRecommendations = controller.recommendationCatalog?.recommendations ?? [];
  const effectiveRecommendationScope = effectiveScope(catalogRecommendations, recommendationScope);
  const scopedRecommendations = catalogRecommendations.filter((recommendation) => matchesScope(recommendation, effectiveRecommendationScope));
  const filteredRecommendations = scopedRecommendations.filter((recommendation) =>
    matchesFilters(controller.recommendationSource, recommendation, controller.recommendationPlatform, controller.recommendationQuery, achievabilityFilter, surfaceFilter),
  );
  const summary = controller.recommendationIndex?.sources.find((candidate) => candidate.source === controller.recommendationSource);
  return {
    availableCategories: Object.keys(countByCategory(catalogRecommendations)).sort(),
    availableSurfaces: uniqueStrings(catalogRecommendations.flatMap((recommendation) => implementationOf(recommendation).surfaces), { sort: true }),
    effectiveRecommendationScope,
    filteredCoverage: summarizeCoverage(filteredRecommendations),
    filteredRecommendations,
    scopedRecommendations,
    selectedRecommendation: filteredRecommendations.find((recommendation) => recommendation.id === controller.selectedRecommendationId),
    sourceCoverage: summary?.coverageSummary ?? summarizeCoverage(catalogRecommendations),
    sources: controller.recommendationIndex?.sources ?? [],
    summary,
  };
}

function effectiveScope(recommendations: readonly RecommendationRecord[], recommendationScope: RecommendationScope): RecommendationScope {
  const actionableRecommendations = recommendations.filter(isActionableSettingRecommendation);
  const recommendationsWithoutSettings = recommendations.filter((recommendation) => !isActionableSettingRecommendation(recommendation));
  return recommendationScope === RECOMMENDATION_SCOPE_ACTIONABLE
    && actionableRecommendations.length === 0
    && recommendationsWithoutSettings.length > 0
    ? RECOMMENDATION_SCOPE_WITHOUT_SETTINGS
    : recommendationScope;
}

function RecommendationSourceTabs(props: {
  readonly controller: EditorController;
  readonly sources: readonly RecommendationSourceSummary[];
}): JSX.Element {
  const tablistRef = useRef<HTMLDivElement>(null);

  function handleSourceKeyDown(event: React.KeyboardEvent, currentSource: RecommendationSource): void {
    const nextId = nextSourceId(event.key, currentSource, props.sources);
    if (nextId === undefined) {
      return;
    }
    event.preventDefault();
    props.controller.setRecommendationSource(nextId);
    const btn = tablistRef.current?.querySelector<HTMLElement>(`#${recommendationTabId(nextId)}`);
    btn?.focus();
  }

  return (
    <div ref={tablistRef} className="recommendation-source-switcher" role="tablist" aria-label="Recommendation sources">
      {props.sources.map((source) => (
        <button
          key={source.source}
          type="button"
          id={recommendationTabId(source.source)}
          role="tab"
          tabIndex={source.source === props.controller.recommendationSource ? 0 : -1}
          aria-selected={source.source === props.controller.recommendationSource}
          aria-controls={recommendationPanelId(source.source)}
          className={source.source === props.controller.recommendationSource ? "active" : ""}
          onClick={() => props.controller.setRecommendationSource(source.source)}
          onKeyDown={(event) => handleSourceKeyDown(event, source.source)}
        >
          {source.label}
        </button>
      ))}
    </div>
  );
}

function nextSourceId(key: string, currentSource: RecommendationSource, sources: readonly RecommendationSourceSummary[]): RecommendationSource | undefined {
  const ids = sources.map((source) => source.source);
  const currentIndex = ids.indexOf(currentSource);
  if (key === "ArrowRight") {
    return ids[(currentIndex + 1) % ids.length];
  }
  if (key === "ArrowLeft") {
    return ids[(currentIndex - 1 + ids.length) % ids.length];
  }
  if (key === "Home") {
    return ids[0];
  }
  return key === "End" ? ids[ids.length - 1] : undefined;
}

function recommendationTabId(source: RecommendationSource): string {
  return `recommendation-tab-${source}`;
}

function recommendationPanelId(source: RecommendationSource): string {
  return `recommendation-panel-${source}`;
}

function RecommendationList(props: {
  readonly recommendations: RecommendationRecord[];
  readonly source: RecommendationSource;
  readonly onSelect: (recommendationId: string) => void;
}): JSX.Element {
  if (props.recommendations.length === 0) {
    return <p className="empty-state">No recommendations match the current filters.</p>;
  }
  return (
    <div className="recommendation-list">
      {props.recommendations.map((recommendation) => (
        <button
          key={recommendation.id}
          type="button"
          className="recommendation-card"
          onClick={() => props.onSelect(recommendation.id)}
        >
          {(() => {
            const implementation = implementationOf(recommendation);
            return (
              <>
                <strong>{recommendation.title}</strong>
                <span>{secondaryRecommendationId(props.source, recommendation)}</span>
                <span>{recommendation.platform}</span>
                <span>Achievability: {categoryLabel(implementation.category)}</span>
                <span>Surfaces: {implementation.surfaces.map(surfaceLabel).join(", ") || "None"}</span>
                <span>Mapping: {recommendation.relutionMapping.status}</span>
                <span>{importabilityLabel(implementation)}</span>
              </>
            );
          })()}
        </button>
      ))}
    </div>
  );
}

function RecommendationDetail(props: {
  readonly summary: RecommendationSourceSummary;
  readonly source: RecommendationSource;
  readonly recommendation: RecommendationRecord;
  readonly onBack: () => void;
}): JSX.Element {
  const implementation = implementationOf(props.recommendation);
  return (
    <div className="recommendation-detail">
      <div className="json-actions">
        <button type="button" onClick={props.onBack}>Back</button>
      </div>
      <h3>{props.recommendation.title}</h3>
      <p className="status">
        {props.summary.label} | {secondaryRecommendationId(props.source, props.recommendation)} | {props.recommendation.platform}
      </p>
      {props.source === "bsi" ? <BsiDetail recommendation={props.recommendation} /> : null}
      {props.source === "cis" ? <CisDetail recommendation={props.recommendation} /> : null}
      {props.source === "vendor" ? <VendorRecommendationDetail recommendation={props.recommendation} /> : null}
      <FallbackTranslationsSection recommendation={props.recommendation} secondaryOnly={implementation.category === "relution-achievable"} open={implementation.category !== "relution-achievable"} />
      <section className="preview-block">
        <h4>Relution mapping</h4>
        <p>Achievability: {categoryLabel(implementation.category)}</p>
        <p>Surfaces: {implementation.surfaces.map(surfaceLabel).join(", ") || "None"}</p>
        <p>Importable via: {implementation.importableVia.join(", ") || "Not importable"}</p>
        <p>Status: {props.recommendation.relutionMapping.status}</p>
        <p>Generated importability: {importabilityLabel(implementation)}</p>
        {implementation.blockingReasons.length > 0 ? (
          <pre>{implementation.blockingReasons.join("\n")}</pre>
        ) : null}
        {props.recommendation.relutionMapping.candidates.length > 0 ? (
          <pre>{props.recommendation.relutionMapping.candidates.map(formatMappingCandidate).join("\n\n")}</pre>
        ) : null}
        {props.recommendation.relutionMapping.rulesetMappings.length > 0 ? (
          <pre>{JSON.stringify(props.recommendation.relutionMapping.rulesetMappings, null, 2)}</pre>
        ) : null}
      </section>
    </div>
  );
}

function formatMappingCandidate(candidate: RecommendationRecord["relutionMapping"]["candidates"][number]): string {
  const lines = [
    `${candidate.kind}: ${candidate.target} (${candidate.fieldPaths.join(", ")})`,
  ];
  if (candidate.semanticConceptId !== undefined && candidate.semanticConceptId.length > 0) {
    lines.push(`concept: ${candidate.semanticConceptId}`);
  }
  if (candidate.match !== undefined) {
    lines.push(`match: ${candidate.match.valueCompatibility} | score ${candidate.match.score}`);
    if (candidate.match.matchedTerms.length > 0) {
      lines.push(`terms: ${candidate.match.matchedTerms.join(", ")}`);
    }
    lines.push(`reason: ${candidate.match.reason}`);
  }
  return lines.join("\n");
}

function CoverageDisclosure({
  coverage,
  total,
  platform,
}: {
  readonly coverage: ReturnType<typeof summarizeCoverage>;
  readonly total: number;
  readonly platform: string;
}): JSX.Element | null {
  const informational = coverage.partialRecommendations + coverage.helperOnlyRecommendations + coverage.gapRecommendations;
  if (total === 0 || informational === 0) {
    return null;
  }
  const scope = platform === ALL_RECOMMENDATION_PLATFORMS ? "this source" : platform;
  return (
    <p className="warning recommendation-summary">
      Coverage note for {scope}: {coverage.actionableRecommendations} of {total} recommendations are actionable exact Relution mappings. The remaining {informational} entries stay informational, partial, or helper-only.
    </p>
  );
}

function CisDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as CisRecommendationRecord;
  return (
    <>
      <CisRecommendationSummaryDetail recommendation={recommendation} />
      {item.impact.length > 0 ? (
        <details className="preview-block">
          <summary>Impact</summary>
          <p>{item.impact}</p>
        </details>
      ) : null}
      <details className="preview-block">
        <summary>Audit</summary>
        <pre>{item.audit}</pre>
      </details>
      <details className="preview-block">
        <summary>Remediation</summary>
        <pre>{item.remediation}</pre>
      </details>
    </>
  );
}

function matchesScope(recommendation: RecommendationRecord, scope: RecommendationScope): boolean {
  if (scope === RECOMMENDATION_SCOPE_ALL) {
    return true;
  }
  const actionable = isActionableSettingRecommendation(recommendation);
  return scope === RECOMMENDATION_SCOPE_ACTIONABLE ? actionable : !actionable;
}

function isActionableSettingRecommendation(recommendation: RecommendationRecord): boolean {
  const implementation = implementationOf(recommendation);
  return recommendation.relutionMapping.status === "exact"
    && implementation.category === "relution-achievable"
    && implementation.importableVia.some((surface) => surface === "ruleset-import" || surface === "apply-json")
    && recommendation.relutionMapping.rulesetMappings.length > 0;
}

function matchesFilters(
  source: RecommendationSource,
  recommendation: RecommendationRecord,
  platform: string,
  query: string,
  achievability: string,
  surface: string,
): boolean {
  if (platform !== ALL_RECOMMENDATION_PLATFORMS && recommendation.platform !== platform) {
    return false;
  }
  const implementation = implementationOf(recommendation);
  if (achievability !== ALL_ACHIEVABILITY && implementation.category !== achievability) {
    return false;
  }
  if (surface !== ALL_SURFACES && !implementation.surfaces.includes(surface as RecommendationImplementation["surfaces"][number])) {
    return false;
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }
  const haystacks = [recommendation.title, recommendation.platform, secondaryRecommendationId(source, recommendation)];
  if (source === "bsi") {
    const item = recommendation as BsiRecommendationRecord;
    haystacks.push(item.moduleId, item.moduleTitle);
    haystacks.push(...(item.semanticConcepts ?? []).flatMap((concept) => [concept.id, concept.label.de, concept.label.en, concept.matchedTerms.join(" ")]));
  }
  if (source === "cis") {
    const item = recommendation as CisRecommendationRecord;
    haystacks.push(item.benchmarkTitle, item.benchmarkVersion);
  }
  if (source === "vendor") {
    const item = recommendation as VendorRecommendationRecord;
    haystacks.push(item.section, item.reason);
  }
  return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
}

function canImportRuleset(catalog: EditorController["recommendationCatalog"], platform: string): boolean {
  if (catalog?.ruleset === undefined) {
    return false;
  }
  if (platform === ALL_RECOMMENDATION_PLATFORMS) {
    return catalog.ruleset.policies.some((policy) => policy.rules.some((rule) => rule.informational !== true && (rule.mappings?.length ?? 0) > 0));
  }
  const importPlatform = catalog.displayToImportPlatform[platform];
  return importPlatform !== undefined
    && catalog.ruleset.policies.some((policy) =>
      policy.platform === importPlatform && policy.rules.some((rule) => rule.informational !== true && (rule.mappings?.length ?? 0) > 0),
    );
}

function implementationOf(recommendation: RecommendationRecord): RecommendationImplementation {
  if (recommendation.implementation !== undefined) {
    return recommendation.implementation;
  }
  const fallbackTranslations = recommendation.fallbackTranslations ?? [];
  const exact = recommendation.relutionMapping.status === "exact";
  const surfaces = uniqueStrings([
    ...recommendation.relutionMapping.candidates.map((candidate) => candidate.kind),
    ...recommendation.relutionMapping.rulesetMappings.map((mapping) => mapping.kind),
    ...(fallbackTranslations.length > 0 ? ["helper"] : []),
  ], { sort: true }) as RecommendationImplementation["surfaces"];
  if (exact) {
    return {
      category: "relution-achievable",
      surfaces,
      importableVia: recommendation.relutionMapping.rulesetMappings.some((mapping) => mapping.kind === "relution-native")
        ? ["apply-json", "ruleset-import"]
        : ["ruleset-import"],
      blockingReasons: recommendation.relutionMapping.notes,
    };
  }
  if (recommendation.relutionMapping.candidates.length > 0) {
    return {
      category: "relution-partial",
      surfaces,
      importableVia: [],
      blockingReasons: recommendation.relutionMapping.notes,
    };
  }
  if (fallbackTranslations.length > 0) {
    return {
      category: "helper-only",
      surfaces,
      importableVia: [],
      blockingReasons: recommendation.relutionMapping.notes,
    };
  }
  return {
    category: "gap",
    surfaces,
    importableVia: [],
    blockingReasons: recommendation.relutionMapping.notes,
  };
}

function importabilityLabel(implementation: RecommendationImplementation): string {
  if (implementation.importableVia.length === 0) {
    return "Info only";
  }
  return `Importable via ${implementation.importableVia.join(", ")}`;
}

function scopeLabel(scope: RecommendationScope): string {
  if (scope === RECOMMENDATION_SCOPE_ACTIONABLE) {
    return "actionable settings";
  }
  if (scope === RECOMMENDATION_SCOPE_WITHOUT_SETTINGS) {
    return "recommendations without settings";
  }
  return "all recommendations";
}

function countByCategory(recommendations: RecommendationRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const recommendation of recommendations) {
    const category = implementationOf(recommendation).category;
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function summarizeCoverage(recommendations: RecommendationRecord[]): {
  exactMappings: number;
  actionableRecommendations: number;
  partialRecommendations: number;
  helperOnlyRecommendations: number;
  gapRecommendations: number;
} {
  let exactMappings = 0;
  const counts = {
    actionableRecommendations: 0,
    partialRecommendations: 0,
    helperOnlyRecommendations: 0,
    gapRecommendations: 0,
  };
  for (const recommendation of recommendations) {
    if (recommendation.relutionMapping.status === "exact") {
      exactMappings += 1;
    }
    const category = implementationOf(recommendation).category;
    if (category === "relution-achievable") {
      counts.actionableRecommendations += 1;
    } else if (category === "relution-partial") {
      counts.partialRecommendations += 1;
    } else if (category === "helper-only") {
      counts.helperOnlyRecommendations += 1;
    } else {
      counts.gapRecommendations += 1;
    }
  }
  return { exactMappings, ...counts };
}

function categoryLabel(category: string): string {
  if (category === "relution-achievable") {
    return "Achievable";
  }
  if (category === "relution-partial") {
    return "Partial";
  }
  if (category === "helper-only") {
    return "Helper only";
  }
  if (category === "gap") {
    return "Gap";
  }
  return category;
}

function surfaceLabel(surface: string): string {
  if (surface === "relution-native") {
    return "Native";
  }
  if (surface === "apple-mobileconfig") {
    return "Apple mobileconfig";
  }
  if (surface === "apple-schema-profile") {
    return "Apple schema";
  }
  if (surface === "helper") {
    return "Helper";
  }
  return surface;
}
