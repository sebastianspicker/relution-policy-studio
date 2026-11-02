import {editorApiFetch, postJson} from 'rexp-studio/ui';
import {canonicalJson} from 'rexp-studio/browser';
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = body === undefined ? await editorApiFetch(url) : await postJson(url, body);
  // Parse failures must not hide the status: a 409 has to reach the conflict handling even without a JSON body.
  const value = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = value?.error;
    const message = typeof error?.message === 'string' ? error.message : typeof error === 'string' ? error : '';
    throw new RequestError(message || `Request failed (${response.status})`, response.status);
  }
  if (value === undefined) throw new RequestError('The local service returned an unreadable response', response.status);
  return value as T;
}
export async function planner<T>(command: string, payload: unknown): Promise<T> {
  const value = await request<{result?: T; ok?: boolean; error?: {message: string}} & T>('/api/campusweave/planner', {
    command,
    payload,
  });
  if (value.ok === false) throw new Error(value.error?.message ?? 'Planner failed');
  return value.result ?? value;
}
export function download(value: unknown, name: string) {
  const blob =
    value instanceof Blob ? value : new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadArchive() {
  const response = await editorApiFetch('/api/output');
  if (!response.ok) {
    const reason = await response
      .json()
      .then(value => value?.error)
      .catch(() => undefined);
    throw new Error(typeof reason === 'string' ? reason : 'Archive is not available');
  }
  download(await response.blob(), 'campusweave.rexp');
}
export async function digest(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value) + '\n'));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
