/** Sends authenticated loopback editor requests and exposes JSON response failures. */
import assert from "node:assert/strict";

export async function editorRequest<T>(baseUrl: string, token: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(path.slice(1), baseUrl);
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-rexp-studio-token": token,
      ...(body === undefined ? {} : { "content-type": "application/json", origin: url.origin }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await response.text();
  assert.equal(response.status, 200, responseBody);
  return JSON.parse(responseBody) as T;
}

export async function rawEditorRequest(baseUrl: string, token: string, path: string, body: unknown): Promise<{ readonly status: number; readonly body: unknown }> {
  const url = new URL(path.slice(1), baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-rexp-studio-token": token, "content-type": "application/json", origin: url.origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as unknown };
}
