/** Renders retryable inline feedback with severity-appropriate live-region behavior. */
import type { JSX, ReactNode } from "react";

export type InlineStatusKind = "loading" | "info" | "warning" | "error" | "success";

export function InlineStatus(props: { readonly children: ReactNode; readonly kind: InlineStatusKind; readonly onRetry?: () => void }): JSX.Element {
  const assertive = props.kind === "error";
  return (
    <div className={`inline-status inline-status--${props.kind}`} role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} aria-busy={props.kind === "loading" || undefined}>
      <span>{props.children}</span>
      {props.onRetry !== undefined ? <button type="button" onClick={props.onRetry}>Retry</button> : null}
    </div>
  );
}
