/** Renders workspace validation and ruleset-import findings. */
import type { JSX } from "react";
import type { EditorController, RulesetImportReport } from "../../shared/editor-contracts.js";

export function ConfigurationInspectorValidation({ controller }: { readonly controller: EditorController }): JSX.Element {
  const issueCount = controller.state.validation.schemaCompatibilityIssueCount ?? 0;
  const compatibilityIssues = controller.state.validation.schemaCompatibilityIssues ?? [];
  return (
    <div className="inspector-content">
      <h2>Validation</h2>
      {controller.state.validation.ok ? <ValidationStatus issueCount={issueCount} /> : null}
      {compatibilityIssues.length > 0 ? (
        <details className="validation-compatibility-details">
          <summary>{issueCount} compatibility {issueCount === 1 ? "note" : "notes"}</summary>
          <ul className="validation-warning-list">
            {compatibilityIssues.map((issue) => (
              <li key={`${issue.path}-${issue.pattern}`}><span className="ledger-finding-copy"><strong>{issue.path}</strong><span>pattern removed</span></span></li>
            ))}
          </ul>
        </details>
      ) : null}
      {controller.isDirty ? <p className="warning">Unsaved workspace changes are being validated locally and will be saved before build.</p> : null}
      {controller.state.validation.errors.map((error) => (
        <p className="error" key={`${error.path}-${error.message}`}><span className="ledger-finding-copy"><strong>{error.path}</strong><span>{error.message}</span></span></p>
      ))}
      {controller.rulesetReport === undefined ? null : <RulesetReportView report={controller.rulesetReport} />}
    </div>
  );
}

function ValidationStatus({ issueCount }: { readonly issueCount: number }): JSX.Element {
  return (
    <div className={issueCount > 0 ? "validation-summary validation-summary--warning" : "validation-summary validation-summary--valid"}>
      <span className="validation-summary-mark" aria-hidden="true">✓</span>
      <div>
        <strong>Ready to build</strong>
        <p className="validation-summary-detail">
          {issueCount > 0 ? "No blocking issues" : <span>Workspace valid</span>}
        </p>
      </div>
      {issueCount > 0 ? <span className="visually-hidden">Workspace valid with compatibility notes</span> : null}
      <p className={issueCount > 0 ? "warning" : "ok"}>
      {issueCount > 0
        ? `Validation degraded: ${issueCount} regex ${issueCount === 1 ? "constraint" : "constraints"} removed`
        : "No blocking validation errors"}
      </p>
    </div>
  );
}

function RulesetReportView({ report }: { readonly report: RulesetImportReport }): JSX.Element {
  return (
    <section className="ruleset-report">
      <h3>Ruleset import</h3>
      <p className={report.conflicts.length === 0 && report.unresolved.length === 0 ? "ok" : "warning"}>
        Applied {report.applied.length}. Conflicts {report.conflicts.length}. Unresolved {report.unresolved.length}. Warnings {report.warnings.length}.
      </p>
      {report.conflicts.map((conflict) => <p className="error" key={conflict}>{conflict}</p>)}
      {report.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      {report.unresolved.map((rule) => (
        <details className="preview-block" key={`${rule.policyName}-${rule.ruleId}`}>
          <summary>{rule.policyName}: {rule.ruleId}</summary>
          <p>{rule.title}</p>
          {rule.suggestions.length > 0 ? <pre>{rule.suggestions.join("\n")}</pre> : null}
        </details>
      ))}
    </section>
  );
}
