import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorController } from "./types.js";
import { SidecarPanel } from "./SidecarPanel.js";
import { createAppState, createEditorControllerStub } from "./useEditorController.test-helpers.js";

describe("SidecarPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves artifact drafts across same-artifact prop refreshes until reset", () => {
    const { rerender } = render(<SidecarPanel controller={createController({ mode: "initial" })} />);

    const textarea = screen.getByLabelText("Values JSON") as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: '{\n  "mode": "draft"\n}',
      },
    });

    rerender(<SidecarPanel controller={createController({ mode: "server-refresh" })} />);
    expect((screen.getByLabelText("Values JSON") as HTMLTextAreaElement).value).toBe('{\n  "mode": "draft"\n}');

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect((screen.getByLabelText("Values JSON") as HTMLTextAreaElement).value).toBe('{\n  "mode": "server-refresh"\n}');
  });

  it("does not remove a sidecar artifact when confirmation is cancelled", () => {
    const controller = createController({ mode: "initial" });

    render(<SidecarPanel controller={controller} />);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    // Inline confirm should appear — artifact not yet removed
    screen.getByRole("button", { name: /confirm remove/i }); // throws if absent
    expect(controller.removeDdmArtifact).not.toHaveBeenCalled();

    // Cancel dismisses the confirm row without removing
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(controller.removeDdmArtifact).not.toHaveBeenCalled();
  });

  it("removes a sidecar artifact after confirmation", () => {
    const controller = createController({ mode: "initial" });

    render(<SidecarPanel controller={controller} />);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    // Click the confirm button in the inline confirm row
    fireEvent.click(screen.getByRole("button", { name: /confirm remove/i }));

    expect(controller.removeDdmArtifact).toHaveBeenCalledWith("artifact-1");
  });

  it("shows disabled placeholders for empty artifact creators", () => {
    render(<SidecarPanel controller={createEditorControllerStub()} />);

    expect(screen.getByRole("option", { name: /select ddm artifact/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /select mdm command draft/i })).toBeTruthy();
  });
});

function createController(values: Record<string, unknown>): EditorController {
  const state = createAppState();

  return createEditorControllerStub({
    state: {
      ...state,
      appleSchema: {
        ...state.appleSchema,
        source: { repository: "", revision: "release", generatedAt: "" },
      },
      sidecar: {
        version: 1,
        appleSchemaRevision: "release",
        mobileConfigRestore: [],
        ddmArtifacts: [
          {
            uuid: "artifact-1",
            schemaId: "com.example.ddm",
            kind: "ddm-configuration",
            title: "DDM Artifact",
            identifier: "com.example.ddm",
            values,
            payload: { payloadType: "com.example.ddm" },
          },
        ],
        mdmCommandArtifacts: [],
        customManifests: [],
      },
    },
  });
}
