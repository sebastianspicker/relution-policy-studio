/** Decodes service JSON without accepting replacement characters for malformed UTF-8. */
import { decodeStrictUtf8 } from "../serialization/strict-utf8.js";

export async function strictResponseJson(response: Response, label: string): Promise<unknown> {
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return JSON.parse(decodeStrictUtf8(bytes, "response")) as unknown;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}
