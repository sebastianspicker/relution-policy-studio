/** Renders compact, semantic status labels for dashboard and workspace state. */
import type { JSX, ReactNode } from "react";

export type StatusChipKind = "neutral" | "info" | "success" | "warning" | "danger";

export function StatusChip(props: {
  readonly children: ReactNode;
  readonly kind?: StatusChipKind;
}): JSX.Element {
  const style = {
    danger: "gap",
    info: "param",
    neutral: "unknown",
    success: "compliant",
    warning: "choice",
  }[props.kind ?? "neutral"];
  return <span className={`status-chip compliance-stat compliance-stat--${style}`}>{props.children}</span>;
}
