import {editorApiFetch, postJson} from 'rexp-studio/ui';
import {canonicalJson} from 'rexp-studio/browser';
export async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = body === undefined ? await editorApiFetch(url) : await postJson(url, body);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? value.error ?? `Request failed (${response.status})`);
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
  if (!response.ok) throw new Error('Archive is not available');
  download(await response.blob(), 'campusweave.rexp');
}
export async function digest(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value) + '\n'));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
