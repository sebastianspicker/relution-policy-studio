import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditorControllerStub } from "./useEditorController.test-helpers.js";
import { WorkspaceToolbar } from "./WorkspaceToolbar.js";

const defaultProps = {
  inspectorPinned: false,
  onToggleInspector: vi.fn(),
};

describe("WorkspaceToolbar", () => {
  it("keeps download unavailable until a fresh build exists", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub({ hasFreshBuild: false })} {...defaultProps} />);

    const downloadButton = screen.getByRole("button", { name: /download/i });

    expect((downloadButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });

  it("shows a download action after a fresh build exists", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub({ hasFreshBuild: true })} {...defaultProps} />);

    const downloadButton = screen.getByRole("button", { name: /download/i });

    expect((downloadButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("reports download failures instead of leaving an unhandled rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<WorkspaceToolbar controller={createEditorControllerStub({ hasFreshBuild: true })} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network down")));
  });

  it("exposes redo action", () => {
    const controller = createEditorControllerStub({ canRedo: true });
    render(<WorkspaceToolbar controller={controller} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /redo/i }));

    expect(controller.redoWorkspace).toHaveBeenCalledTimes(1);
  });

  it("does not contain a clear button (clear moved to Settings panel)", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub()} {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /^clear/i })).toBeNull();
  });

  it("applies primary and build styling to the build button", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub()} {...defaultProps} />);

    const buildButton = screen.getByRole("button", { name: /build/i });

    expect(buildButton.classList.contains("btn-primary")).toBe(true);
    expect(buildButton.classList.contains("btn-build")).toBe(true);
  });

  it("shows a dirty dot indicator when the workspace is unsaved", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub({ isDirty: true })} {...defaultProps} />);

    expect(screen.getByRole("status", { hidden: true })).toBeTruthy();
  });

  it("hides the dirty dot indicator when the workspace is saved", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub({ isDirty: false })} {...defaultProps} />);

    expect(screen.queryByRole("status", { hidden: true })).toBeNull();
  });
});
