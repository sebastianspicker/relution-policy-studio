/** Return the first capture group so absent optional XML fields normalize to an empty string. */
export function firstMatch(value, pattern) {
  return pattern.exec(String(value ?? ""))?.[1] ?? "";
}

/** Decode only the entity set emitted by the reviewed Windows SyncML samples. */
export function decodeXmlEntities(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&#xF000;", "\uF000");
}
