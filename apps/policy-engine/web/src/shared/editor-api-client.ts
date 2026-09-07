/** Performs same-origin, token-authenticated editor API requests. */
import type { AppState } from "./editor-contracts.js";
import { readJsonResponse } from "./editor-record-utils.js";

const NETWORK_EDITOR_TOKEN_STORAGE_NAME = "rexp-studio:editor-token";

export async function loadState(): Promise<AppState> {
  const response = await editorApiFetch("/api/state");
  const state = await readJsonResponse<AppState>(response);
  if (!response.ok) {
    throw new Error(`Failed to load editor state: ${JSON.stringify(state)}`);
  }
  return state;
}

export async function editorApiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(networkEditorAuthHeaders());
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  return await window.fetch(editorApiUrl(url), { ...init, headers });
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return await editorApiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function editorApiUrl(url: string): URL {
  if (typeof window === "undefined") {
    throw new Error("Editor API requests require a browser window origin.");
  }
  const parsed = new URL(url, window.location.origin);
  if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith("/api/")) {
    throw new Error(`Blocked editor API request outside same-origin /api/: ${url}`);
  }
  return parsed;
}

export function networkEditorAuthHeaders(): Record<string, string> {
  const token = networkEditorToken();
  return typeof token === "undefined" ? {} : { "x-rexp-studio-token": token };
}

function networkEditorToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const fragmentToken = tokenFromHash(window.location.hash);
  if (fragmentToken !== undefined) {
    window.sessionStorage.setItem(NETWORK_EDITOR_TOKEN_STORAGE_NAME, fragmentToken);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return fragmentToken;
  }
  return window.sessionStorage.getItem(NETWORK_EDITOR_TOKEN_STORAGE_NAME) ?? undefined;
}

function tokenFromHash(hash: string): string | undefined {
  const prefix = "#editorToken=";
  if (!hash.startsWith(prefix)) {
    return undefined;
  }
  const encodedToken = hash.slice(prefix.length);
  try {
    return decodeURIComponent(encodedToken);
  } catch {
    return encodedToken;
  }
}
