import type { JSX } from "react";
import type { WorkspacePolicy } from "../../../src/workspace.js";

type EditorBreadcrumbProps = {
  readonly policy: WorkspacePolicy | undefined;
  readonly versionName?: string | undefined;
};

export function EditorBreadcrumb({ policy, versionName }: EditorBreadcrumbProps): JSX.Element | null {
  if (policy === undefined) {
    return null;
  }

  const policyName = typeof policy.document.name === "string" ? policy.document.name : policy.path;

  return (
    <nav className="editor-breadcrumb" aria-label="Editing context">
      <span className="breadcrumb-segment">{policyName}</span>
      {versionName !== undefined ? (
        <>
          <span className="breadcrumb-separator" aria-hidden="true">›</span>
          <span className="breadcrumb-segment breadcrumb-segment--config">{versionName}</span>
        </>
      ) : null}
    </nav>
  );
}
