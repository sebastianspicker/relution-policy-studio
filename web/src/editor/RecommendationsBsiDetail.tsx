import type { JSX } from "react";
import type { BsiRecommendationRecord, RecommendationRecord } from "../../../src/recommendation-types.js";

export function BsiDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
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
      <BsiThreatContext item={item} />
      <BsiErrata item={item} />
      <BsiKompendium item={item} />
      <BsiGrundschutzPlusPlus item={item} />
      <BsiSemanticConcepts item={item} />
    </>
  );
}

function BsiThreatContext({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element | null {
  return item.moduleThreatContext.length > 0 ? (
    <details className="preview-block">
      <summary>Threat context</summary>
      <pre>{item.moduleThreatContext.map((entry) => `${entry.title}\n${entry.text}`).join("\n\n")}</pre>
    </details>
  ) : null;
}

function BsiErrata({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element | null {
  return item.errata.length > 0 ? (
    <details className="preview-block">
      <summary>Errata</summary>
      <pre>{JSON.stringify(item.errata, null, 2)}</pre>
    </details>
  ) : null;
}

function BsiKompendium({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element | null {
  if (item.grundschutzKompendium === undefined) {
    return null;
  }
  const kompendium = item.grundschutzKompendium;
  return (
    <details className="preview-block">
      <summary>Grundschutz Kompendium checklist comparison</summary>
      <p>
        Checklist: {kompendium.individualChecklistSourcePath ?? "not found"} | Type: {kompendium.individualChecklistRequirementType ?? "unknown"} | Matches DocBook: {String(kompendium.individualChecklistMatchesDocBook)}
      </p>
      {kompendium.differences.length > 0 ? <p>Differences: {kompendium.differences.join(", ")}</p> : null}
      {kompendium.relatedChecklistItems.length > 0 ? (
        <pre>{kompendium.relatedChecklistItems.map((entry) => `${entry.requirementId} ${entry.title} [${entry.type}]\n${entry.text}`).join("\n\n")}</pre>
      ) : null}
    </details>
  );
}

function BsiGrundschutzPlusPlus({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element | null {
  if (item.grundschutzPlusPlus === undefined) {
    return null;
  }
  const plusPlus = item.grundschutzPlusPlus;
  return (
    <details className="preview-block">
      <summary>Grundschutz++ systematics</summary>
      <p>{plusPlus.methodDocument} | {plusPlus.methodVersion} | {plusPlus.policyEditorRole}</p>
      <p>Target categories: {plusPlus.platformTargetObjectCategories.join(", ") || "none"}</p>
      <BsiGrundschutzPlusPlusControls item={item} />
    </details>
  );
}

function BsiGrundschutzPlusPlusControls({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element {
  const controls = item.grundschutzPlusPlus?.relatedControls ?? [];
  return controls.length > 0 ? (
    <pre>{controls.map((control) => `${control.id} ${control.title} | ${control.practiceId}/${control.controlGroupId} | ${control.modalVerb ?? "?"} | ${control.securityLevel ?? "?"} | ${control.matchReason}\n${control.statement}`).join("\n\n")}</pre>
  ) : (
    <p>No directly related GS++ control was selected for this requirement.</p>
  );
}

function BsiSemanticConcepts({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element {
  const concepts = item.semanticConcepts ?? [];
  return (
    <details className="preview-block" open={concepts.length > 0}>
      <summary>Semantic concepts</summary>
      {concepts.length > 0 ? (
        <pre>{concepts.map(formatSemanticConcept).join("\n\n")}</pre>
      ) : (
        <p>{item.semanticNoConceptReason ?? "No semantic concept evidence was emitted."}</p>
      )}
    </details>
  );
}

function formatSemanticConcept(concept: NonNullable<BsiRecommendationRecord["semanticConcepts"]>[number]): string {
  const targets = concept.candidateTargets.map((target) => `${target.kind}: ${target.target} (${target.fieldPaths.join(", ")})`).join("\n  ");
  const evidence = concept.evidence.map(formatSemanticEvidence).join("\n  ");
  return `${concept.id} | ${concept.label.en} / ${concept.label.de} | confidence ${concept.confidence}
terms: ${concept.matchedTerms.join(", ")}
gs++: ${concept.relatedGrundschutzPlusPlusControlIds.join(", ") || "none"}
targets:
  ${targets || "none"}
evidence:
  ${evidence}`;
}

function formatSemanticEvidence(source: NonNullable<BsiRecommendationRecord["semanticConcepts"]>[number]["evidence"][number]): string {
  const sourceId = source.sourceId === undefined ? "" : `/${source.sourceId}`;
  return `${source.source}${sourceId} ${source.confidence}: ${source.matchedTerms.join(", ")}`;
}
