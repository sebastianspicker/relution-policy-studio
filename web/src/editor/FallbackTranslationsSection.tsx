import type { JSX } from "react";
import type { RecommendationFallbackTranslation, RecommendationRecord } from "../../../src/recommendation-types.js";

export function FallbackTranslationsSection(props: {
  readonly recommendation: RecommendationRecord;
  readonly secondaryOnly?: boolean;
  readonly open?: boolean;
}): JSX.Element | null {
  const fallbacks = props.recommendation.fallbackTranslations ?? [];
  if (fallbacks.length === 0) {
    return null;
  }
  const detailsProps = props.open === undefined ? {} : { open: props.open };
  return (
    <details className="preview-block" {...detailsProps}>
      <summary>{props.secondaryOnly === true ? "Fallback methods (secondary only)" : "Fallback methods"}</summary>
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
