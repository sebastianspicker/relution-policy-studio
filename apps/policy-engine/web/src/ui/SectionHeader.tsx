/** Standardizes page-section titles, descriptions, and optional contextual actions. */
import type { JSX, ReactNode } from "react";

export function SectionHeader(props: {
  readonly title: string;
  readonly description: string;
  readonly meta?: ReactNode;
}): JSX.Element {
  return (
    <header className="section-header">
      <div className="section-header-copy">
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.meta === undefined ? null : <div className="section-header-meta">{props.meta}</div>}
    </header>
  );
}
