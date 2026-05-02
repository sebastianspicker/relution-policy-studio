import type { JSX } from "react";
import type { AppleCompatSetting } from "../../../src/apple-compat.js";
import type { AppleSchemaEntry } from "../../../src/apple-schema.js";
import type { ConfigurationTemplate } from "../../../src/templates.js";
import type { WorkspacePolicy } from "../../../src/workspace.js";

type EditorBreadcrumbProps = {
  readonly policy: WorkspacePolicy | undefined;
  readonly template: ConfigurationTemplate | undefined;
  readonly appleCompatSetting: AppleCompatSetting | undefined;
  readonly appleSchemaProfile: AppleSchemaEntry | undefined;
  readonly hasConfiguration: boolean;
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
