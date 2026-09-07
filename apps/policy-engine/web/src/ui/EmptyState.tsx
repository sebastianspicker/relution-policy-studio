import type { ReactNode, JSX } from "react";

export function EmptyState(props: {
  readonly className?: string;
  readonly children?: ReactNode;
  readonly description?: string;
  readonly headingLevel?: "h1" | "h2";
  readonly title: string;
}): JSX.Element {
  const Heading = props.headingLevel ?? "h2";
  return (
    <section className={`empty-state empty-state--ledger${props.className === undefined ? "" : ` ${props.className}`}`}>
      <span className="empty-state-mark" aria-hidden="true" />
      <div>
        <Heading>{props.title}</Heading>
        {props.description === undefined ? null : <p>{props.description}</p>}
        {props.children}
      </div>
    </section>
  );
}
