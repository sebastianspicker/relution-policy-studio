/** Browser workspace contracts and construction helpers. Persistence remains behind the loopback API. */
export type {
  PolicyWorkspace,
  WorkspacePolicy,
  WorkspaceValidationResult,
} from "../workspace/types.js";
export type { ConfigurationTemplate, RelutionTemplateBundle, TemplateField } from "../contracts/template.js";


export { createWorkspaceMetadata, createWorkspacePolicyEntry } from "../workspace/workspace-model.js";
export { createWorkspaceExportReport } from "../workspace/workspace-export-report.js";
