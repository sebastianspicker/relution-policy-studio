/** Decodes externally supplied UTF-8 without silently replacing malformed bytes. */
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function decodeStrictUtf8(bytes: AllowSharedBufferSource, label: string): string {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch (error) {
    throw new Error(`Invalid UTF-8 ${label}`, { cause: error });
  }
}
