/** Hosts the routed section view while preserving predictable page landmarks. */
import type { JSX, ReactNode } from "react";
import type { AppSection } from "../shared/application-sections.js";

export function SectionViewport(props: {
  readonly section: Exclude<AppSection, "policies">;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className={`section-workspace section-workspace--${props.section}`} aria-label={sectionLabel(props.section)}>
      <div className="section-workspace-content">{props.children}</div>
    </section>
  );
}

function sectionLabel(section: Exclude<AppSection, "policies">): string {
  if (section === "device-audit") return "Device audit workspace";
  return `${section[0]!.toUpperCase()}${section.slice(1)} workspace`;
}
