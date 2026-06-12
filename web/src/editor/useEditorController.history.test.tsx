import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorController } from "./useEditorController.js";
import {
  currentReady,
  installFetchMock,
  waitForReady,
} from "./useEditorController.test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditorController history", () => {
  it("sets beforeunload returnValue when the workspace is dirty", async () => {
    await renderDirtySelectedConfiguration("Dirty name");

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", { configurable: true, writable: true, value: undefined });

    window.dispatchEvent(event);

    expect(event.returnValue).toBe("");
  });

  it("clears the dirty beforeunload warning after undo restores a clean workspace", async () => {
    const result = await renderDirtySelectedConfiguration("Dirty name");

    await act(async () => {
      currentReady(result).controller.undoWorkspace();
    });

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", { configurable: true, writable: true, value: undefined });

    window.dispatchEvent(event);

    expect(event.returnValue).toBeUndefined();
  });

  it("supports redo after undoing a local workspace edit", async () => {
    installFetchMock();
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await act(async () => {
      const controller = currentReady(result).controller;
      controller.updateSelectedConfiguration({
        ...(controller.configuration ?? {}),
        details: {
          ...(controller.details ?? {}),
          name: "Redo name",
        },
      });
    });

    expect(currentReady(result).controller.canUndo).toBe(true);
    expect(currentReady(result).controller.canRedo).toBe(false);

    await act(async () => {
      currentReady(result).controller.undoWorkspace();
    });

    expect(currentReady(result).controller.details?.name).toBe("Original name");
    expect(currentReady(result).controller.canRedo).toBe(true);

    await act(async () => {
      currentReady(result).controller.redoWorkspace();
    });

    expect(currentReady(result).controller.details?.name).toBe("Redo name");
    expect(currentReady(result).controller.canUndo).toBe(true);
  });

  it("clears the workspace with undo and redo support", async () => {
    installFetchMock();
    vi.spyOn(window, "confirm").mockImplementation(() => {
      throw new Error("clearWorkspace should not call window.confirm");
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    expect(currentReady(result).controller.state.workspace.policies.length).toBe(1);

    await act(async () => {
      currentReady(result).controller.clearWorkspace();
    });

    expect(currentReady(result).controller.state.workspace.policies.length).toBe(0);
    expect(currentReady(result).controller.isDirty).toBe(true);
    expect(currentReady(result).controller.status).toBe("Cleared workspace");

    await act(async () => {
      currentReady(result).controller.undoWorkspace();
    });

    expect(currentReady(result).controller.state.workspace.policies.length).toBe(1);

    await act(async () => {
      currentReady(result).controller.redoWorkspace();
    });

    expect(currentReady(result).controller.state.workspace.policies.length).toBe(0);
  });
});

async function renderDirtySelectedConfiguration(name: string) {
  installFetchMock();
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

  await act(async () => {
    currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
  });

  await act(async () => {
    const controller = currentReady(result).controller;
    controller.updateSelectedConfiguration({
      ...(controller.configuration ?? {}),
      details: {
        ...(controller.details ?? {}),
        name,
      },
    });
  });

  return result;
}
