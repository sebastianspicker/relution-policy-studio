/** Selects the concrete editor for a resolved configuration type. */
import type { JSX } from "react";
import { AppleCompatFields } from "../features/policy-workspace/fields/AppleCompatFields.js";
import { AppleSchemaFields } from "../features/policy-workspace/fields/AppleSchemaFields.js";
import { GeneratedFields } from "../features/policy-workspace/fields/GeneratedFields.js";
import { MobileConfigFields } from "../features/policy-workspace/fields/MobileConfigFields.js";
import { EmptyState } from "../ui/EmptyState.js";
import type { EditorController } from "../shared/editor-contracts.js";

export function EditorFields({ controller }: { readonly controller: EditorController }): JSX.Element {
  const details = controller.details;
  const configuration = controller.configuration;
  if (configuration === undefined || details === undefined) return <EmptyState title="No editable configuration selected." />;
  const updateDetails = (nextDetails: Record<string, unknown>) => controller.updateSelectedConfiguration({ ...configuration, details: nextDetails });
  if (controller.appleCompatSetting !== undefined) return <AppleCompatFields setting={controller.appleCompatSetting} details={details} onError={controller.setStatus} onChange={updateDetails} />;
  if (controller.appleSchemaProfile !== undefined) return <AppleSchemaFields entry={controller.appleSchemaProfile} details={details} onError={controller.setStatus} onChange={updateDetails} />;
  if (details.type === "APPLE_MOBILECONFIG") return <MobileConfigFields details={details} onError={controller.setStatus} onChange={updateDetails} />;
  if (controller.template !== undefined) return <GeneratedFields template={controller.template} details={details} onChange={updateDetails} />;
  return <EmptyState title="No editable configuration selected." />;
}
