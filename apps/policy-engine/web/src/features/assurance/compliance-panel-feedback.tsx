/** Shows report warnings and transient compliance request state without hiding source controls. */
import type { JSX } from "react";
import type { ComplianceReport } from "../../../../src/browser/assurance.js";

export function ComplianceFeedback(props: {
  readonly report: ComplianceReport | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
}): JSX.Element {
  return (
    <>
      {props.report?.warnings?.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      {props.error === undefined ? null : <p className="error">{props.error}</p>}
      {props.loading ? <p className="loading-inline" aria-live="polite">Checking compliance…</p> : null}
      {props.report === undefined && !props.loading ? <p className="empty-state">No compliance report has been generated yet.</p> : null}
    </>
  );
}
