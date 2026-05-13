import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel.js";
import { createAppState, createEditorControllerStub } from "./useEditorController.test-helpers.js";

const defaultProps = {
  theme: "default" as const,
  onThemeChange: vi.fn(),
};

describe("SettingsPanel", () => {
  it("shows a clear workspace button in the danger zone", () => {
    render(<SettingsPanel controller={createEditorControllerStub()} {...defaultProps} />);

    expect(screen.getByRole("button", { name: /clear workspace/i })).toBeTruthy();
  });

  it("applies danger styling to the clear workspace button", () => {
    render(<SettingsPanel controller={createEditorControllerStub()} {...defaultProps} />);

    const clearButton = screen.getByRole("button", { name: /clear workspace/i });

    expect(clearButton.classList.contains("btn-danger")).toBe(true);
  });

  it("shows inline confirmation prompt on clear click", () => {
    const controller = createEditorControllerStub({ isDirty: true });
    render(<SettingsPanel controller={controller} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /clear workspace/i }));

    expect(screen.getByRole("button", { name: /yes, clear workspace/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(controller.clearWorkspace).not.toHaveBeenCalled();
  });

  it("calls clearWorkspace when the user confirms", () => {
    const controller = createEditorControllerStub({ isDirty: true });
    render(<SettingsPanel controller={controller} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /clear workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, clear workspace/i }));

    expect(controller.clearWorkspace).toHaveBeenCalledTimes(1);
  });

  it("does not call clearWorkspace when the user cancels", () => {
    const controller = createEditorControllerStub({ isDirty: true });
    render(<SettingsPanel controller={controller} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /clear workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(controller.clearWorkspace).not.toHaveBeenCalled();
  });

  it("disables clear when workspace is empty and not dirty", () => {
    const state = createAppState();
    const controller = createEditorControllerStub({
      isDirty: false,
      state: {
        ...state,
        workspace: { ...state.workspace, policies: [] },
      },
    });
    render(<SettingsPanel controller={controller} {...defaultProps} />);

    const clearButton = screen.getByRole("button", { name: /clear workspace/i }) as HTMLButtonElement;

    expect(clearButton.disabled).toBe(true);
  });

  it("shows explicit encryption key state instead of overloading the input placeholder", () => {
    const state = createAppState();
    render(<SettingsPanel controller={createEditorControllerStub({ state: { ...state, keySet: true } })} {...defaultProps} />);

    expect(screen.getByText(/key set/i)).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter encryption key...")).toBeTruthy();
  });
});
