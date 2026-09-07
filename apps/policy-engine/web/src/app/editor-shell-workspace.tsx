/** Presents the selected policy configuration and delegates its specialized editor surface. */
import { useState, type JSX } from "react";
import { ConfigurationPickerModal } from "../features/policy-workspace/ConfigurationPickerModal.js";
import { EditorBreadcrumb } from "./EditorBreadcrumb.js";
import { EditorConfiguration, getEditorVersionName } from "./editor-shell-configuration.js";
import { EmptyState } from "../ui/EmptyState.js";
import type { EditorController } from "../shared/editor-contracts.js";

export function EditorWorkspace({ controller }: { readonly controller: EditorController }): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);
  const versionName = getEditorVersionName(controller);

  function closePicker(): void {
    setPickerOpen(false);
  }

  const pickerModal = pickerOpen ? (
    <ConfigurationPickerModal
      availableTemplates={controller.availableTemplates}
      presentNativeTypes={controller.presentNativeTypes}
      availableAppleCompatSettings={controller.availableAppleCompatSettings}
      availableAppleSchemaProfiles={controller.availableAppleSchemaProfiles}
      customSettingsAvailable={controller.policy?.document.platform === "MACOS"}
      selectedType={controller.selectedType}
      query={controller.addQuery}
      group={controller.addGroup}
      onSelectedTypeChange={controller.setSelectedType}
      onQueryChange={controller.setAddQuery}
      onGroupChange={controller.setAddGroup}
      onAdd={() => {
        void controller.addConfiguration();
        closePicker();
      }}
      onClose={closePicker}
    />
  ) : null;

  if (controller.selection === undefined) return <EditorWelcome />;

  return controller.configuration === undefined ? (
    <>
      <EditorBreadcrumb policy={controller.policy} versionName={versionName} />
      <EditorConfiguration.Empty controller={controller} pickerModal={pickerModal} onOpenPicker={() => setPickerOpen(true)} />
    </>
  ) : (
    <>
      <EditorBreadcrumb policy={controller.policy} versionName={versionName} />
      <EditorConfiguration.Selected controller={controller} pickerModal={pickerModal} onOpenPicker={() => setPickerOpen(true)} />
    </>
  );
}

function EditorWelcome(): JSX.Element {
  return (
    <EmptyState className="editor-welcome" headingLevel="h1" title="Select a policy to start editing" description="Pick a policy version from the navigator, or create a new platform policy to add configurations." />
  );
}
