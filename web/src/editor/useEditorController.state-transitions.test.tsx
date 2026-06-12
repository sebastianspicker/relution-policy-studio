import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorController } from "./useEditorController.js";
import { createAppState, currentReady, installFetchMock, waitForReady } from "./useEditorController.test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditorController state transitions", () => {
  it("clears the workspace without consulting window confirmation", async () => {
    installFetchMock();
    vi.spyOn(window, "confirm").mockImplementation(() => {
      throw new Error("clearWorkspace should not call window.confirm");
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.clearWorkspace();
    });

    expect(currentReady(result).controller.state.workspace.policies.length).toBe(0);
    expect(currentReady(result).controller.isDirty).toBe(true);
    expect(currentReady(result).controller.status).toBe("Cleared workspace");
  });

  it("removes a DDM artifact from controller sidecar state after a confirmed API response", async () => {
    const state = createAppState();
    state.sidecar = {
      ...state.sidecar,
      ddmArtifacts: [
        {
          uuid: "artifact-1",
          schemaId: "com.example.ddm",
          kind: "ddm-configuration",
          title: "DDM Artifact",
          identifier: "com.example.ddm",
          values: {},
          payload: { payloadType: "com.example.ddm" },
        },
      ],
    };
    const nextSidecar = { ...state.sidecar, ddmArtifacts: [] };
    const requests = installFetchMock(state, {
      sidecarResponses: {
        "/api/ddm/artifact/remove": { sidecar: nextSidecar },
      },
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      await currentReady(result).controller.removeDdmArtifact("artifact-1");
    });

    expect(currentReady(result).controller.state.sidecar.ddmArtifacts).toEqual([]);
    expect(currentReady(result).controller.status).toBe("Removed DDM artifact");
    expect(requests.find((request) => request.url === "/api/ddm/artifact/remove")?.body).toEqual({ uuid: "artifact-1" });
  });

  it("keeps sidecar state and reports a blocked status when artifact removal returns no sidecar", async () => {
    const state = createAppState();
    state.sidecar = {
      ...state.sidecar,
      ddmArtifacts: [
        {
          uuid: "artifact-1",
          schemaId: "com.example.ddm",
          kind: "ddm-configuration",
          title: "DDM Artifact",
          identifier: "com.example.ddm",
          values: {},
          payload: { payloadType: "com.example.ddm" },
        },
      ],
    };
    installFetchMock(state, {
      sidecarResponses: {
        "/api/ddm/artifact/remove": { error: "cannot remove artifact" },
      },
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      await currentReady(result).controller.removeDdmArtifact("artifact-1");
    });

    expect(currentReady(result).controller.state.sidecar.ddmArtifacts).toHaveLength(1);
    expect(currentReady(result).controller.status).toBe('Removed DDM artifact blocked: {"error":"cannot remove artifact"}');
  });

  it("replaces stale successful validation when live validation fails", async () => {
    const state = createAppState();
    state.validation = { ok: true, errors: [] };
    installFetchMock(state, {
      workspaceValidateError: new Error("network down"),
    });
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
          name: "Needs live validation",
        },
      });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.status).toBe("Live validation failed: network down");
    });
    expect(currentReady(result).controller.state.validation).toEqual({
      ok: false,
      errors: [{ path: "workspace", message: "network down" }],
    });
  });
});
