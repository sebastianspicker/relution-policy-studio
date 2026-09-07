/** Renders and formats BSI semantic-concept evidence. */
import type { JSX } from "react";
import type { BsiRecommendationRecord } from "../../../../src/browser/assurance.js";

export function BsiSemanticConcepts({ item }: { readonly item: BsiRecommendationRecord }): JSX.Element {
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
