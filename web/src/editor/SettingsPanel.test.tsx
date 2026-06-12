import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel.js";
import { createAppState, createEditorControllerStub } from "./useEditorController.test-helpers.js";

const defaultProps = {
  theme: "default" as const,
  onThemeChange: vi.fn(),
};

describe("SettingsPanel", () => {
  it("presents clear workspace inside the destructive actions section", () => {
    render(<SettingsPanel controller={createEditorControllerStub()} {...defaultProps} />);

    const dangerZone = screen.getByRole("heading", { name: /danger zone/i }).closest("section");

    expect(dangerZone).not.toBeNull();
    expect(within(dangerZone as HTMLElement).getByText(/permanently removes all local policy data/i)).toBeTruthy();
    expect(within(dangerZone as HTMLElement).getByRole("button", { name: /clear workspace/i })).toBeTruthy();
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

  it("shows validated encryption key state instead of overloading the input placeholder", () => {
    const state = createAppState();
    render(<SettingsPanel controller={createEditorControllerStub({ state: { ...state, keySet: true, keyValidated: true } })} {...defaultProps} />);

    expect(screen.getByText(/key validated/i)).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter encryption key...")).toBeTruthy();
  });

  it("distinguishes an accepted but unvalidated encryption key", () => {
    const state = createAppState();
    render(<SettingsPanel controller={createEditorControllerStub({ state: { ...state, keySet: true, keyValidated: false } })} {...defaultProps} />);

    expect(screen.getByText(/key set, not validated/i)).toBeTruthy();
  });
});
