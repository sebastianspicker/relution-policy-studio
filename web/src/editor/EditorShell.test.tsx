import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorShell } from "./EditorShell.js";
import { createAppState, createEditorControllerStub, installFetchMock } from "./useEditorController.test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EditorShell", () => {
  it("labels policy creation controls", () => {
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /new policy/i }));

    expect(screen.getByLabelText(/new policy name/i)).toBeTruthy();
    expect(screen.getByLabelText(/new policy platform/i)).toBeTruthy();
  });

  it("exposes collapsible mobile pane controls", () => {
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    const navigation = screen.getByRole("button", { name: /navigation/i });
    const inspector = document.querySelector('[aria-controls="editor-inspector-pane"]') as HTMLButtonElement;

    expect(navigation.getAttribute("aria-expanded")).toBe("false");
    expect(inspector.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".workspace-grid")?.classList.contains("show-navigation")).toBe(false);
    expect(document.querySelector(".workspace-grid")?.classList.contains("show-inspector")).toBe(false);

    fireEvent.click(navigation);
    fireEvent.click(inspector);

    expect(navigation.getAttribute("aria-expanded")).toBe("true");
    expect(inspector.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".workspace-grid")?.classList.contains("show-navigation")).toBe(true);
    expect(document.querySelector(".workspace-grid")?.classList.contains("show-inspector")).toBe(true);
  });

  it("exposes every app section in the responsive section switcher", () => {
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    for (const label of ["Policies", "Baseline", "Dashboard", "Settings"]) {
      expect(screen.getAllByRole("button", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("renders the policy wizard as a primary app section inside Baseline", async () => {
    installFetchMock();
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: /baseline/i })[0]!);

    expect(await screen.findByRole("heading", { name: /policy wizard/i })).toBeTruthy();
    expect(await screen.findByRole("radio", { name: /tier 3/i })).toBeTruthy();
    expect(screen.getByText(/classroom devices/i)).toBeTruthy();
  });

  it("renders expert wizard settings with tier coverage", async () => {
    installFetchMock();
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: /baseline/i })[0]!);
    fireEvent.click(await screen.findByRole("tab", { name: /expert/i }));

    expect(await screen.findByText(/selected baseline coverage/i)).toBeTruthy();
    expect(await screen.findByText(/current workspace compliance/i)).toBeTruthy();
    expect((await screen.findAllByText(/NATIVE_SINGLE/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BSI bsi-ios-passcode/i).length).toBeGreaterThan(0);
  });

  it("shows settings panel with key and import inputs when settings section is selected", () => {
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: /settings/i })[0]!);

    expect(screen.getByLabelText(/encryption key/i)).toBeTruthy();
    expect(screen.getByLabelText(/relution \.rexp file/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /no policy version selected/i })).toBeNull();
  });

  it("renders the Relution dashboard as a primary app section", () => {
    render(<EditorShell controller={createEditorControllerStub()} theme="default" onThemeChange={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("button", { name: /dashboard/i })[0]!);

    expect(screen.getByRole("heading", { name: /relution dashboard/i })).toBeTruthy();
    expect(screen.getByText(/no relution api session configured/i)).toBeTruthy();
  });

  it("does not show selected-setting JSON import before a configuration is selected", () => {
    const state = createAppState();
    const policy = state.workspace.policies[0]!;
    render(
      <EditorShell
        controller={createEditorControllerStub({
          state,
          policy,
          selection: { policyIndex: 0, versionIndex: 0 },
          configuration: undefined,
        })}
        theme="default"
        onThemeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /configurations/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add configuration/i })).toBeTruthy();
    expect(screen.queryByLabelText(/selected setting json file/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /apply json/i })).toBeNull();
  });

  it("maps primary undo and redo keyboard shortcuts to the correct controller actions", () => {
    const controller = createEditorControllerStub();
    render(<EditorShell controller={controller} theme="default" onThemeChange={vi.fn()} />);

    fireEvent.keyDown(document, { key: "z", metaKey: true });
    fireEvent.keyDown(document, { key: "z", metaKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: "y", ctrlKey: true });

    expect(controller.undoWorkspace).toHaveBeenCalledTimes(1);
    expect(controller.redoWorkspace).toHaveBeenCalledTimes(2);
  });
});
