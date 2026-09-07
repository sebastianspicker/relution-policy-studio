/** Composes policy-document and selected-configuration editing actions. */
import type { PolicyEditingActionsInput } from "./editor-policy-action-contract.js";
export type { PolicyEditingActionsInput } from "./editor-policy-action-contract.js";
import { createConfigurationEditingActions } from "./editor-configuration-edit-actions.js";
import { createPolicyDocumentActions } from "./editor-policy-document-actions.js";


export function createPolicyEditingActions(input: PolicyEditingActionsInput):
  ReturnType<typeof createPolicyDocumentActions> & ReturnType<typeof createConfigurationEditingActions> {
  return {
    ...createPolicyDocumentActions(input),
    ...createConfigurationEditingActions(input),
  };
}
