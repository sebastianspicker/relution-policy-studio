import { useEffect, useRef, useState, type JSX } from "react";
import type {
  BsiRecommendationRecord,
  CisRecommendationRecord,
  RecommendationFallbackTranslation,
  RecommendationImplementation,
  RecommendationRecord,
  RecommendationSource,
  RecommendationSourceSummary,
  VendorRecommendationRecord,
} from "../../../src/recommendation-types.js";
import { fallbackTranslationsOf, secondaryRecommendationId } from "./recommendation-record-utils.js";
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
  const summary = c.recommendationIndex?.sources.find((candidate) => candidate.source === c.recommendationSource);
  const catalog = c.recommendationCatalog;
  useEffect(() => {
    setAchievabilityFilter(ALL_ACHIEVABILITY);
    setSurfaceFilter(ALL_SURFACES);
    setRecommendationScope(RECOMMENDATION_SCOPE_ACTIONABLE);
  }, [c.recommendationSource]);
  const categoryCounts = countByCategory(catalog?.recommendations ?? []);
  const availableCategories = Object.keys(categoryCounts).sort();
  const availableSurfaces = uniqueStrings((catalog?.recommendations ?? []).flatMap((recommendation) => implementationOf(recommendation).surfaces));
  const recommendations = catalog?.recommendations ?? [];
  const actionableRecommendations = recommendations.filter(isActionableSettingRecommendation);
  const recommendationsWithoutSettings = recommendations.filter((recommendation) => !isActionableSettingRecommendation(recommendation));
  const effectiveRecommendationScope = recommendationScope === RECOMMENDATION_SCOPE_ACTIONABLE
    && actionableRecommendations.length === 0
    && recommendationsWithoutSettings.length > 0
    ? RECOMMENDATION_SCOPE_WITHOUT_SETTINGS
    : recommendationScope;
  const scopedRecommendations = recommendations.filter((recommendation) => matchesScope(recommendation, effectiveRecommendationScope));
  const filteredRecommendations = scopedRecommendations.filter((recommendation) =>
    matchesFilters(c.recommendationSource, recommendation, c.recommendationPlatform, c.recommendationQuery, achievabilityFilter, surfaceFilter),
  );
  const selectedRecommendation = filteredRecommendations.find((recommendation) => recommendation.id === c.selectedRecommendationId);
  const importDisabled = !canImportRuleset(catalog, c.recommendationPlatform);
  const sourceCoverage = summary?.coverageSummary ?? summarizeCoverage(catalog?.recommendations ?? []);
  const filteredCoverage = summarizeCoverage(filteredRecommendations);
  useEffect(() => {
    if (c.selectedRecommendationId !== undefined && selectedRecommendation === undefined) {
      c.setSelectedRecommendationId(undefined);
    }
  }, [c, selectedRecommendation]);

  const tablistRef = useRef<HTMLDivElement>(null);
  const sources = c.recommendationIndex?.sources ?? [];

  function handleSourceKeyDown(event: React.KeyboardEvent, currentSource: RecommendationSource): void {
    const ids = sources.map((s) => s.source);
    const currentIndex = ids.indexOf(currentSource);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % ids.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + ids.length) % ids.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ids.length - 1;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      const nextId = ids[nextIndex]!;
      c.setRecommendationSource(nextId);
      const btn = tablistRef.current?.querySelector<HTMLElement>(`#${recommendationTabId(nextId)}`);
      btn?.focus();
    }
  }

  return (
    <div className="inspector-content recommendations-panel">
      <h2>Recommendations</h2>
      <div ref={tablistRef} className="recommendation-source-switcher" role="tablist" aria-label="Recommendation sources">
        {sources.map((source) => (
          <button
            key={source.source}
            type="button"
            id={recommendationTabId(source.source)}
            role="tab"
            tabIndex={source.source === c.recommendationSource ? 0 : -1}
            aria-selected={source.source === c.recommendationSource}
            aria-controls={recommendationPanelId(source.source)}
            className={source.source === c.recommendationSource ? "active" : ""}
            onClick={() => c.setRecommendationSource(source.source)}
            onKeyDown={(e) => handleSourceKeyDown(e, source.source)}
          >
            {source.label}
          </button>
        ))}
      </div>
      <section id={recommendationPanelId(c.recommendationSource)} role="tabpanel" aria-labelledby={recommendationTabId(c.recommendationSource)}>
        {summary !== undefined ? (
          <>
            <p className="status recommendation-summary">
              {summary.label} | {summary.recommendationCount} recommendations | verified {summary.verifiedAsOf ?? "unknown"}
            </p>
            <p className="status recommendation-summary">
              Exact {sourceCoverage.exactMappings} | Actionable {sourceCoverage.actionableRecommendations} | Partial {sourceCoverage.partialRecommendations} | Helper {sourceCoverage.helperOnlyRecommendations} | Gap {sourceCoverage.gapRecommendations}
            </p>
            <p className="status recommendation-summary">
              Showing {scopeLabel(effectiveRecommendationScope)}: {filteredRecommendations.length} of {scopedRecommendations.length} scoped recommendations
            </p>
            <CoverageDisclosure coverage={filteredCoverage} total={filteredRecommendations.length} platform={c.recommendationPlatform} />
          </>
        ) : null}
        {c.recommendationsError !== undefined ? <p className="error">{c.recommendationsError}</p> : null}
        {summary === undefined || c.recommendationsLoading ? <p className="loading-inline" aria-live="polite">Loading recommendation catalog…</p> : null}
        {summary !== undefined && !c.recommendationsLoading ? (
          <>
            <div className="recommendation-controls">
              <label>
                Scope
                <select value={effectiveRecommendationScope} onChange={(event) => setRecommendationScope(event.target.value as RecommendationScope)}>
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
                  {summary.displayPlatforms.map((platform) => (
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
                  {availableCategories.map((category) => (
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
                  {availableSurfaces.map((surface) => (
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
            ) : selectedRecommendation === undefined ? (
              <RecommendationList
                recommendations={filteredRecommendations}
                source={c.recommendationSource}
                onSelect={(recommendationId) => c.setSelectedRecommendationId(recommendationId)}
              />
            ) : (
              <RecommendationDetail
                summary={summary}
                source={c.recommendationSource}
                recommendation={selectedRecommendation}
                onBack={() => c.setSelectedRecommendationId(undefined)}
              />
            )}
          </>
        ) : null}
      </section>
    </div>
  );
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
      {props.source === "vendor" ? <VendorDetail recommendation={props.recommendation} /> : null}
      <FallbackTranslationsSection recommendation={props.recommendation} />
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

function BsiDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as BsiRecommendationRecord;
  return (
    <>
      <p>{item.moduleId} | {item.moduleTitle}</p>
      <p>{item.category} | {item.status} | {item.protectionLevel}</p>
      <details className="preview-block" open>
        <summary>Requirement</summary>
        <p>{item.requirementText}</p>
      </details>
      <details className="preview-block">
        <summary>Reason</summary>
        <p>{item.reason}</p>
      </details>
      {item.moduleThreatContext.length > 0 ? (
        <details className="preview-block">
          <summary>Threat context</summary>
          <pre>{item.moduleThreatContext.map((entry) => `${entry.title}\n${entry.text}`).join("\n\n")}</pre>
        </details>
      ) : null}
      {item.errata.length > 0 ? (
        <details className="preview-block">
          <summary>Errata</summary>
          <pre>{JSON.stringify(item.errata, null, 2)}</pre>
        </details>
      ) : null}
      {item.grundschutzKompendium !== undefined ? (
        <details className="preview-block">
          <summary>Grundschutz Kompendium checklist comparison</summary>
          <p>
            Checklist: {item.grundschutzKompendium.individualChecklistSourcePath ?? "not found"} | Type: {item.grundschutzKompendium.individualChecklistRequirementType ?? "unknown"} | Matches DocBook: {String(item.grundschutzKompendium.individualChecklistMatchesDocBook)}
          </p>
          {item.grundschutzKompendium.differences.length > 0 ? <p>Differences: {item.grundschutzKompendium.differences.join(", ")}</p> : null}
          {item.grundschutzKompendium.relatedChecklistItems.length > 0 ? (
            <pre>{item.grundschutzKompendium.relatedChecklistItems.map((entry) => `${entry.requirementId} ${entry.title} [${entry.type}]\n${entry.text}`).join("\n\n")}</pre>
          ) : null}
        </details>
      ) : null}
      {item.grundschutzPlusPlus !== undefined ? (
        <details className="preview-block">
          <summary>Grundschutz++ systematics</summary>
          <p>
            {item.grundschutzPlusPlus.methodDocument} | {item.grundschutzPlusPlus.methodVersion} | {item.grundschutzPlusPlus.policyEditorRole}
          </p>
          <p>Target categories: {item.grundschutzPlusPlus.platformTargetObjectCategories.join(", ") || "none"}</p>
          {item.grundschutzPlusPlus.relatedControls.length > 0 ? (
            <pre>{item.grundschutzPlusPlus.relatedControls.map((control) => `${control.id} ${control.title} | ${control.practiceId}/${control.controlGroupId} | ${control.modalVerb ?? "?"} | ${control.securityLevel ?? "?"} | ${control.matchReason}\n${control.statement}`).join("\n\n")}</pre>
          ) : (
            <p>No directly related GS++ control was selected for this requirement.</p>
          )}
        </details>
      ) : null}
      <details className="preview-block" open={(item.semanticConcepts?.length ?? 0) > 0}>
        <summary>Semantic concepts</summary>
        {item.semanticConcepts !== undefined && item.semanticConcepts.length > 0 ? (
          <pre>
            {item.semanticConcepts.map((concept) => {
              const targets = concept.candidateTargets.map((target) => `${target.kind}: ${target.target} (${target.fieldPaths.join(", ")})`).join("\n  ");
              const evidence = concept.evidence.map((source) => `${source.source}${source.sourceId !== undefined ? `/${source.sourceId}` : ""} ${source.confidence}: ${source.matchedTerms.join(", ")}`).join("\n  ");
              return `${concept.id} | ${concept.label.en} / ${concept.label.de} | confidence ${concept.confidence}
terms: ${concept.matchedTerms.join(", ")}
gs++: ${concept.relatedGrundschutzPlusPlusControlIds.join(", ") || "none"}
targets:
  ${targets || "none"}
evidence:
  ${evidence}`;
            }).join("\n\n")}
          </pre>
        ) : (
          <p>{item.semanticNoConceptReason ?? "No semantic concept evidence was emitted."}</p>
        )}
      </details>
    </>
  );
}

function CisDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as CisRecommendationRecord;
  return (
    <>
      <p>{item.benchmarkTitle} | v{item.benchmarkVersion} | {item.recommendationId}</p>
      <p>{String(item.recommendedValue)} | default {String(item.defaultValue)}</p>
      {item.profileApplicability.length > 0 ? <p>{item.profileApplicability.join(", ")}</p> : null}
      <details className="preview-block" open>
        <summary>Description</summary>
        <p>{item.description}</p>
      </details>
      <details className="preview-block">
        <summary>Rationale</summary>
        <p>{item.rationale}</p>
      </details>
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

function FallbackTranslationsSection({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element | null {
  const fallbacks = fallbackTranslationsOf(recommendation);
  if (fallbacks.length === 0) {
    return null;
  }
  const exactMapped = implementationOf(recommendation).category === "relution-achievable";
  return (
    <details className="preview-block" open={!exactMapped}>
      <summary>{exactMapped ? "Fallback methods (secondary only)" : "Fallback methods"}</summary>
      {fallbacks.map((fallback) => <FallbackTranslationView key={fallback.id} fallback={fallback} />)}
    </details>
  );
}

function FallbackTranslationView({ fallback }: { readonly fallback: RecommendationFallbackTranslation }): JSX.Element {
  return (
    <section className="preview-block">
      <h5>{fallback.title}</h5>
      <p>{fallback.role} | {fallback.method}</p>
      {fallback.commands.length > 0 ? <pre>{fallback.commands.join("\n")}</pre> : null}
      {fallback.groupPolicyPaths !== undefined && fallback.groupPolicyPaths.length > 0 ? (
        <>
          <h6>Group Policy paths</h6>
          <pre>{fallback.groupPolicyPaths.join("\n")}</pre>
        </>
      ) : null}
      {fallback.registryPaths !== undefined && fallback.registryPaths.length > 0 ? (
        <>
          <h6>Registry references</h6>
          <pre>{fallback.registryPaths.join("\n")}</pre>
        </>
      ) : null}
      {fallback.profilePayloadType !== undefined ? <p>PayloadType: {fallback.profilePayloadType}</p> : null}
      {fallback.profileKeys !== undefined && fallback.profileKeys.length > 0 ? (
        <>
          <h6>Profile keys</h6>
          <pre>{fallback.profileKeys.map((entry) => `${entry.key}: ${entry.value}`).join("\n")}</pre>
        </>
      ) : null}
      {fallback.rawText.length > 0 ? (
        <details className="preview-block">
          <summary>Source excerpt</summary>
          <pre>{fallback.rawText}</pre>
        </details>
      ) : null}
    </section>
  );
}

function VendorDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as VendorRecommendationRecord;
  return (
    <>
      <p>{item.section} | recommended {String(item.recommendedValue)}</p>
      <details className="preview-block" open>
        <summary>Reason</summary>
        <p>{item.reason}</p>
      </details>
      {item.sourceIds.length > 0 ? <p>Sources: {item.sourceIds.join(", ")}</p> : null}
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
  const exact = recommendation.relutionMapping.status === "exact";
  const surfaces = uniqueStrings([
    ...recommendation.relutionMapping.candidates.map((candidate) => candidate.kind),
    ...recommendation.relutionMapping.rulesetMappings.map((mapping) => mapping.kind),
    ...(fallbackTranslationsOf(recommendation).length > 0 ? ["helper"] : []),
  ]) as RecommendationImplementation["surfaces"];
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
  if (fallbackTranslationsOf(recommendation).length > 0) {
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
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
