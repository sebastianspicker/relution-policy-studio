import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorControllerStub } from "./useEditorController.test-helpers.js";
import { WorkspaceToolbar } from "./WorkspaceToolbar.js";

const defaultProps = {
  inspectorPinned: false,
  onToggleInspector: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("reports rejected downloads through visible editor status", async () => {
    const controller = createEditorControllerStub({ hasFreshBuild: true });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    render(<WorkspaceToolbar controller={controller} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(controller.setStatus).toHaveBeenCalledTimes(2));
    expect(controller.setStatus).toHaveBeenLastCalledWith("Download failed: network down");
  });

  it("reports non-OK downloads through visible editor status", async () => {
    const controller = createEditorControllerStub({ hasFreshBuild: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404, statusText: "Not Found" }));
    render(<WorkspaceToolbar controller={controller} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(controller.setStatus).toHaveBeenCalledWith("Download failed: Failed to download output archive (404 Not Found)"));
  });

  it("redo toolbar action only replays when an undone workspace change exists", () => {
    const unavailableController = createEditorControllerStub({ canRedo: false });
    const { rerender } = render(<WorkspaceToolbar controller={unavailableController} {...defaultProps} />);

    const unavailableRedoButton = screen.getByRole("button", { name: /redo/i }) as HTMLButtonElement;

    expect(unavailableRedoButton.disabled).toBe(true);
    fireEvent.click(unavailableRedoButton);
    expect(unavailableController.redoWorkspace).not.toHaveBeenCalled();

    const controller = createEditorControllerStub({ canRedo: true });
    rerender(<WorkspaceToolbar controller={controller} {...defaultProps} />);

    const redoButton = screen.getByRole("button", { name: /redo/i }) as HTMLButtonElement;

    expect(redoButton.disabled).toBe(false);
    fireEvent.click(redoButton);

    expect(controller.redoWorkspace).toHaveBeenCalledTimes(1);
  });

  it("build action starts archive creation and blocks duplicate clicks while running", () => {
    const controller = createEditorControllerStub({ isBuildLoading: false });
    const { rerender } = render(<WorkspaceToolbar controller={controller} {...defaultProps} />);

    const buildButton = screen.getByRole("button", { name: /build .rexp/i }) as HTMLButtonElement;

    expect(buildButton.disabled).toBe(false);
    fireEvent.click(buildButton);
    expect(controller.buildArchive).toHaveBeenCalledTimes(1);

    const loadingController = createEditorControllerStub({ isBuildLoading: true });
    rerender(<WorkspaceToolbar controller={loadingController} {...defaultProps} />);

    const loadingBuildButton = screen.getByRole("button", { name: /build .rexp/i }) as HTMLButtonElement;

    expect(loadingBuildButton.disabled).toBe(true);
    fireEvent.click(loadingBuildButton);
    expect(loadingController.buildArchive).not.toHaveBeenCalled();
  });

  it("does not contain a clear button (clear moved to Settings panel)", () => {
    render(<WorkspaceToolbar controller={createEditorControllerStub()} {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /^clear/i })).toBeNull();
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
