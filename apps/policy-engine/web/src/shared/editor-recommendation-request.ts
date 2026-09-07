/** Runs a cancellable recommendation request and publishes only current results. */
import type { Dispatch, SetStateAction } from "react";
import { networkEditorAuthHeaders } from "./editor-api-client.js";
import { readJsonResponse } from "./editor-record-utils.js";

export function requestRecommendationData<T>(
  url: string,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | undefined>>,
  onSuccess: (result: T) => void,
): () => void {
  let cancelled = false;
  setLoading(true);
  setError(undefined);
  void executeRecommendationRequest(url, setLoading, setError, onSuccess, () => cancelled);
  return () => { cancelled = true; };
}

async function executeRecommendationRequest<T>(
  url: string,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | undefined>>,
  onSuccess: (result: T) => void,
  isCancelled: () => boolean,
): Promise<void> {
  try {
    const result = await loadRecommendationData<T>(url);
    if (!isCancelled()) onSuccess(result);
  } catch (error) {
    if (!isCancelled()) setError(error instanceof Error ? error.message : String(error));
  } finally {
    if (!isCancelled()) setLoading(false);
  }
}

// Separate lifetime caches prevent browse, detail and executable rulesets from sharing entries.
const browseCache = new Map<string, Promise<unknown>>();
const detailCache = new Map<string, Promise<unknown>>();
const rulesetCache = new Map<string, Promise<unknown>>();

export function loadRecommendationData<T>(url: string): Promise<T> {
  const cache = url.endsWith("/ruleset") ? rulesetCache : url.includes("/records/") ? detailCache : browseCache;
  const existing = cache.get(url);
  if (existing !== undefined) return existing as Promise<T>;
  const pending = fetchRecommendationData<T>(url).catch((error: unknown) => {
    cache.delete(url);
    throw error;
  });
  cache.set(url, pending);
  return pending;
}

async function fetchRecommendationData<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: networkEditorAuthHeaders() });
  const result = await readJsonResponse<T>(response);
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
