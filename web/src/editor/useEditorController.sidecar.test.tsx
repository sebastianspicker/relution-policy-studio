import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentReady, installFetchMock, waitForReady } from "./useEditorController.test-helpers.js";
import { useEditorController } from "./useEditorController.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditorController sidecar actions", () => {
  it("blocks empty DDM schema selection without sending a request", async () => {
    const { fetchMock, result } = await renderReadyController();

    await act(async () => {
      await currentReady(result).controller.addDdmArtifact();
    });

    expect(currentReady(result).controller.status).toBe("Added offline DDM artifact blocked: missing ddmSchemaId");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks empty MDM command schema selection without sending a request", async () => {
    const { fetchMock, result } = await renderReadyController();

    await act(async () => {
      await currentReady(result).controller.addMdmCommandArtifact();
    });

    expect(currentReady(result).controller.status).toBe("Added offline MDM command draft blocked: missing mdmCommandSchemaId");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks empty artifact UUID updates without sending a request", async () => {
    const { fetchMock, result } = await renderReadyController();

    await act(async () => {
      await currentReady(result).controller.updateDdmArtifact("", "{}");
    });

    expect(currentReady(result).controller.status).toBe("Updated DDM artifact blocked: missing artifact UUID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function renderReadyController() {
  installFetchMock();
  const fetchMock = vi.mocked(globalThis.fetch);
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);
  await waitFor(() => {
    expect(currentReady(result).controller.recommendationCatalog?.source).toBe("bsi");
  });
  fetchMock.mockClear();
  return { fetchMock, result };
}
