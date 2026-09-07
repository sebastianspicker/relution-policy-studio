/** Binds document-level application shortcuts without intercepting native editable controls. */
import { useEffect } from "react";
import type { AppSection } from "../shared/application-sections.js";
import type { EditorController } from "../shared/editor-contracts.js";

type EditorShellShortcuts = {
  readonly appSection: AppSection;
  readonly controller: EditorController;
  readonly onToggleInspector: () => void;
};

export function useEditorShellShortcuts({ appSection, controller, onToggleInspector }: EditorShellShortcuts): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const shortcut = shortcutForEvent(event, appSection);
      if (shortcut === undefined) return;
      if (shortcut !== "save" && isEditableTarget(event.target)) return;
      event.preventDefault();
      runShortcut(shortcut, controller, onToggleInspector);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [appSection, controller, onToggleInspector]);
}

function shortcutForEvent(event: KeyboardEvent, appSection: AppSection): "save" | "build" | "toggle-inspector" | "undo" | "redo" | undefined {
  if (!event.ctrlKey && !event.metaKey) return undefined;
  if (event.key === "s") return "save";
  if (event.key === "b") return "build";
  if (event.key === "i" && appSection === "policies") return "toggle-inspector";
  if (event.key === "z") return event.shiftKey ? "redo" : "undo";
  return event.key === "y" ? "redo" : undefined;
}

function runShortcut(shortcut: Exclude<ReturnType<typeof shortcutForEvent>, undefined>, controller: EditorController, onToggleInspector: () => void): void {
  switch (shortcut) {
    case "save":
      void controller.saveWorkspace();
      return;
    case "build":
      void controller.buildArchive();
      return;
    case "toggle-inspector":
      onToggleInspector();
      return;
    case "undo":
      controller.undoWorkspace();
      return;
    case "redo":
      controller.redoWorkspace();
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName));
}
