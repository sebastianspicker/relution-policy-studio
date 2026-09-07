/** Renders selected and empty configuration states without owning route or picker state. */
import type { JSX } from "react";
import { APPLE_COMPAT_HINT } from "../../../src/browser/apple.js";
import { asRecord } from "../shared/editor-record-utils.js";
import { InfoButton } from "../features/policy-workspace/fields/InfoButton.js";
import { EditorFields } from "./editor-shell-fields.js";
import { JsonTemplateImportControl } from "../ui/JsonTemplateImportControl.js";
import { Button } from "../ui/Button.js";
import type { EditorController } from "../shared/editor-contracts.js";

type SelectedProps = { readonly controller: EditorController; readonly pickerModal: JSX.Element | null; readonly onOpenPicker: () => void };
type EmptyProps = SelectedProps;

export const EditorConfiguration = {
  Selected({ controller, pickerModal, onOpenPicker }: SelectedProps): JSX.Element {
    const header = configurationHeader(controller);
    const posture = configurationPosture(controller);
    const chips = configurationChips(controller, posture);
    return (
      <>
        <div className="panel-header">
          <div>
            {chips.length > 0 ? (
              <div className="doc-kicker" aria-label="Configuration summary">
                {chips.map((chip) => (
                  <span key={chip.key} className={chip.className}>{chip.label}</span>
                ))}
              </div>
            ) : null}
            <h1>{header.title}</h1>
            <p>
              {header.description}
              {controller.appleCompatSetting !== undefined ? <InfoButton label={controller.appleCompatSetting.label} description={APPLE_COMPAT_HINT} source="Relution APPLE_MOBILECONFIG" /> : null}
              {controller.appleCompatSetting === undefined && controller.template?.description !== undefined ? <InfoButton label={controller.template.label} description={controller.template.description} source={controller.template.descriptionSource} /> : null}
            </p>
          </div>
          <dl className="configuration-posture" aria-label="Configuration posture">
            <PostureMetric label="Editing" value={`${posture.configured} / ${posture.controls} configured`} />
            <PostureMetric label="Guidance" value={`${posture.recommendations} recommendations`} />
            <PostureMetric
              className={posture.blocking === 0 ? "configuration-posture-metric--success" : "configuration-posture-metric--blocked"}
              label={posture.blocking === 0 ? "Ready to build" : "Build blocked"}
              value={posture.blocking === 0 ? "No blocking issues" : `${posture.blocking} blocking`}
            />
          </dl>
          <div className="configuration-tools">
            <Button type="button" className="btn-add-configuration" size="compact" variant="secondary" onClick={onOpenPicker}>+ Add configuration</Button>
            <JsonTemplateImportControl label="Apply JSON" ariaLabel="Selected setting JSON file" disabled={false} onFileChange={controller.setJsonTemplateFile} onImport={() => void controller.importJsonTemplates()} />
          </div>
        </div>
        {pickerModal}
        <div className="editor-content"><EditorFields controller={controller} /></div>
      </>
    );
  },
  Empty({ controller, pickerModal, onOpenPicker }: EmptyProps): JSX.Element {
    const document = controller.policy?.document;
    const identity = {
      description: typeof document?.description === "string" ? document.description : "",
      name: typeof document?.name === "string" ? document.name : "",
      platform: typeof document?.platform === "string" ? document.platform : "",
    };
    return (
      <>
        <div className="policy-version-context">
          <div className="pvc-identity">
            <div className="pvc-meta"><span className="pvc-platform">{identity.platform}</span></div>
            <input className="pvc-name" aria-label="Policy name" value={identity.name} onChange={(event) => controller.renameSelectedPolicy(event.target.value)} />
            <textarea className="pvc-description" aria-label="Policy description" placeholder="Add a description…" value={identity.description} onChange={(event) => controller.updateSelectedPolicyDescription(event.target.value)} />
          </div>
          <div className="pvc-actions">
            <Button type="button" size="compact" variant="secondary" onClick={controller.duplicateSelectedPolicy}>Duplicate</Button>
            <Button type="button" size="compact" variant="danger" onClick={controller.deleteSelectedPolicy}>Delete</Button>
          </div>
        </div>
        <div className="panel-header">
          <div><h1>Configurations</h1><p>Add or import configurations for this policy version.</p></div>
          <div className="configuration-tools"><Button type="button" className="btn-add-configuration" size="compact" variant="secondary" onClick={onOpenPicker}>+ Add configuration</Button></div>
        </div>
        {pickerModal}
      </>
    );
  },
};

function configurationHeader(controller: EditorController): { readonly description: string; readonly title: string } {
  if (controller.appleCompatSetting !== undefined) return { description: `APPLE_MOBILECONFIG | ${controller.appleCompatSetting.payloadType}`, title: `${controller.appleCompatSetting.label} *` };
  if (controller.appleSchemaProfile !== undefined) return { description: `APPLE_MOBILECONFIG | ${controller.appleSchemaProfile.identifier} | Apple schema ${controller.state.appleSchema.source.revision}`, title: `${controller.appleSchemaProfile.title} *` };
  if (controller.template === undefined) return { description: "Select or add a configuration.", title: "Configuration" };
  return { description: `${controller.template.type} | ${controller.template.schemaName} | ${controller.template.multiConfig ? "multi" : "single"}`, title: controller.template.label };
}

function configurationChips(
  controller: EditorController,
  posture: { readonly blocking: number },
): readonly { readonly key: string; readonly className: string; readonly label: string }[] {
  const chips: { key: string; className: string; label: string }[] = [];
  const platform = typeof controller.policy?.document.platform === "string" ? controller.policy.document.platform : undefined;
  if (platform !== undefined && platform.length > 0) {
    chips.push({ key: "platform", className: "chip mono", label: platform });
  }
  if (controller.template !== undefined) {
    chips.push({
      key: "cardinality",
      className: "chip",
      label: controller.template.multiConfig ? "Multi configuration" : "Single configuration",
    });
  }
  if (controller.state.validation.ok && posture.blocking === 0) {
    chips.push({ key: "schema", className: "chip ok", label: "Schema valid" });
  } else if (!controller.state.validation.ok || posture.blocking > 0) {
    chips.push({ key: "schema", className: "chip warn", label: "Schema issues" });
  }
  const notes = controller.state.validation.schemaCompatibilityIssueCount ?? 0;
  if (notes > 0) {
    chips.push({
      key: "compat",
      className: "chip warn",
      label: `${notes} compatibility ${notes === 1 ? "note" : "notes"}`,
    });
  }
  return chips;
}

function PostureMetric(props: { readonly className?: string; readonly label: string; readonly value: number | string }): JSX.Element {
  return (
    <div className={props.className === undefined ? "configuration-posture-metric" : `configuration-posture-metric ${props.className}`}>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function configurationPosture(controller: EditorController): {
  readonly blocking: number;
  readonly configured: number;
  readonly controls: number;
  readonly recommendations: number;
} {
  const editableEntries = Object.entries(controller.details ?? {}).filter(([key]) => key !== "type");
  const configured = editableEntries.filter(([, value]) => value !== undefined && value !== null && value !== "").length;
  return {
    blocking: controller.state.validation.errors.length,
    configured,
    controls: controller.template?.fields.length ?? editableEntries.length,
    recommendations: controller.complianceReport?.summary.totalRecommendations ?? 0,
  };
}

export function getEditorVersionName(controller: EditorController): string | undefined {
  if (controller.policy === undefined || controller.selection === undefined) return undefined;
  const versions = Array.isArray(controller.policy.document.versions) ? controller.policy.document.versions : [];
  const version = asRecord(versions[controller.selection.versionIndex]);
  return typeof version?.name === "string" && version.name.length > 0 ? version.name : `Version ${controller.selection.versionIndex + 1}`;
}
