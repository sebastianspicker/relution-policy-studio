import {
  decodeXmlEntities,
  firstMatch,
} from "./windows-rexp-evidence-xml-entities.mjs";

/** Extract the CSP target, state, and values from the limited SyncML sample shape. */
export function parseSyncMl(syncMl) {
  const locUri = firstMatch(syncMl, /<LocURI>(.*?)<\/LocURI>/su);
  const data = decodeXmlEntities(firstMatch(syncMl, /<Data><!\[CDATA\[(.*?)\]\]><\/Data>/su));
  return {
    locUri,
    data,
    state: syncMlState(data),
    dataValues: [...data.matchAll(/<data\s+id="([^"]+)"\s+value="([^"]*)"\s*\/>/gsu)].map((match) => ({
      id: decodeXmlEntities(match[1] ?? ""),
      value: decodeXmlEntities(match[2] ?? ""),
    })),
  };
}

/** Classify the explicit enabled/disabled marker without treating unknown XML as safe. */
function syncMlState(data) {
  if (hasXmlEmptyTag(data, "enabled")) {
    return "enabled";
  }
  if (hasXmlEmptyTag(data, "disabled")) {
    return "disabled";
  }
  return "unknown";
}

/** Scan for an exact empty tag while avoiding a general-purpose XML parser for this small grammar. */
function hasXmlEmptyTag(value, tagName) {
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("<", cursor);
    if (start === -1) {
      return false;
    }
    const end = value.indexOf(">", start + 1);
    if (end === -1) {
      return false;
    }
    const tag = value.slice(start + 1, end).trim();
    if (tag === `${tagName}/` || tag === `${tagName} /`) {
      return true;
    }
    cursor = end + 1;
  }
  return false;
}
