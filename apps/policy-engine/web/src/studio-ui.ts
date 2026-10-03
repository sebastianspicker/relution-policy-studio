/** Package entry point exposing the editor controller and field editors embedded by the workbench. */
export { useEditorController } from "./app/useEditorController.js";
export type { EditorController } from "./shared/editor-contracts.js";
export { editorApiFetch, postJson } from "./shared/editor-api-client.js";
export { versionRecord } from "./shared/editor-workspace-utils.js";
export { GeneratedFields } from "./features/policy-workspace/fields/GeneratedFields.js";
export { AppleSchemaFields } from "./features/policy-workspace/fields/AppleSchemaFields.js";
export { AppleCompatFields } from "./features/policy-workspace/fields/AppleCompatFields.js";
export { MobileConfigFields } from "./features/policy-workspace/fields/MobileConfigFields.js";
