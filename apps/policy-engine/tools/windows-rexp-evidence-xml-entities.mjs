/** Return the first capture group so absent optional XML fields normalize to an empty string. */
export function firstMatch(value, pattern) {
  return pattern.exec(String(value ?? ""))?.[1] ?? "";
}

const XML_ENTITIES = {
  "&quot;": "\"", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&#xF000;": "\uF000", "&amp;": "&",
};

/** Decode only the entity set emitted by the reviewed Windows SyncML samples. */
export function decodeXmlEntities(value) {
  return String(value).replace(/&(?:quot|apos|lt|gt|#xF000|amp);/gu, (entity) => XML_ENTITIES[entity] ?? entity);
}
