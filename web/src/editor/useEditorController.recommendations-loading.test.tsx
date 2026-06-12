import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentReady, createAppState, createRecommendationCatalog, createRecommendationIndex, jsonResponse, waitForReady } from "./useEditorController.test-helpers.js";
import { useEditorController } from "./useEditorController.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditorController recommendation loading", () => {
  it("keeps loading while the selected catalog is still pending after the index resolves", async () => {
    const catalog = deferredResponse();
    installRecommendationFetchMock({ bsi: catalog.promise });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationIndex).toBeDefined();
    });
    expect(currentReady(result).controller.recommendationCatalog).toBeUndefined();
    expect(currentReady(result).controller.recommendationsLoading).toBe(true);

    await act(async () => {
      catalog.resolve(jsonResponse(createRecommendationCatalog()));
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationCatalog?.source).toBe("bsi");
    });
    expect(currentReady(result).controller.recommendationsLoading).toBe(false);
  });

  it("keeps loading while the index is still pending after the selected catalog resolves", async () => {
    const index = deferredResponse();
    installRecommendationFetchMock({ index: index.promise });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationCatalog?.source).toBe("bsi");
    });
    expect(currentReady(result).controller.recommendationIndex).toBeUndefined();
    expect(currentReady(result).controller.recommendationsLoading).toBe(true);

    await act(async () => {
      index.resolve(jsonResponse(createRecommendationIndex()));
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationIndex).toBeDefined();
    });
    expect(currentReady(result).controller.recommendationsLoading).toBe(false);
  });

  it("clears loading and reports an error when the selected catalog request fails", async () => {
    const catalog = deferredResponse();
    installRecommendationFetchMock({ bsi: catalog.promise });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationIndex).toBeDefined();
    });
    expect(currentReady(result).controller.recommendationsLoading).toBe(true);

    await act(async () => {
      catalog.resolve(jsonResponse({ error: "catalog unavailable" }, 500));
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationsError).toContain("catalog unavailable");
    });
    expect(currentReady(result).controller.recommendationCatalog).toBeUndefined();
    expect(currentReady(result).controller.recommendationsLoading).toBe(false);
  });

  it("keeps loading for a new source when the previous source request resolves late", async () => {
    const bsi = deferredResponse();
    const vendor = deferredResponse();
    installRecommendationFetchMock({ bsi: bsi.promise, vendor: vendor.promise });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationIndex).toBeDefined();
    });

    await act(async () => {
      currentReady(result).controller.setRecommendationSource("vendor");
    });
    await waitFor(() => {
      expect(currentReady(result).controller.recommendationSource).toBe("vendor");
    });

    await act(async () => {
      bsi.resolve(jsonResponse(createRecommendationCatalog()));
    });
    expect(currentReady(result).controller.recommendationCatalog).toBeUndefined();
    expect(currentReady(result).controller.recommendationsLoading).toBe(true);

    await act(async () => {
      vendor.resolve(jsonResponse(createRecommendationCatalog({ source: "vendor", label: "Vendor", displayPlatforms: ["ANDROID"] })));
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationCatalog?.source).toBe("vendor");
    });
    expect(currentReady(result).controller.recommendationsLoading).toBe(false);
  });
});

function installRecommendationFetchMock(options: {
  readonly index?: Promise<Response>;
  readonly bsi?: Promise<Response>;
  readonly vendor?: Promise<Response>;
}): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = requestPath(input);
    if (url === "/api/state") {
      return jsonResponse(createAppState());
    }
    if (url === "/api/recommendations") {
      return options.index ?? jsonResponse(createRecommendationIndex());
    }
    if (url === "/api/recommendations/bsi") {
      return options.bsi ?? jsonResponse(createRecommendationCatalog());
    }
    if (url === "/api/recommendations/vendor") {
      return options.vendor ?? jsonResponse(createRecommendationCatalog({ source: "vendor", label: "Vendor", displayPlatforms: ["ANDROID"] }));
    }
    if (url === "/api/recommendations/cis") {
      return jsonResponse(createRecommendationCatalog({ source: "cis", label: "CIS" }));
    }
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
}

function deferredResponse(): {
  readonly promise: Promise<Response>;
  readonly resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function requestPath(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  return input.url;
}
