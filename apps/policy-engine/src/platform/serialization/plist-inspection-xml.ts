/** Produces safe unsigned plist markup without evaluating XML entities. */
import { isPlistDocument } from "./plist-inspection-xml-structure.js";
import { standardPlistDoctype } from "./plist-inspection-xml-syntax.js";
import { tokenizeXml } from "./plist-inspection-xml-tokens.js";

const XML_COMMENT_PATTERN = new RegExp("<!--[\\s\\S]*?-->", "gu");
const XML_CDATA_PATTERN = new RegExp("<!\\[CDATA\\[[\\s\\S]*?\\]\\]>", "gu");

export function inspectedUnsignedPlist(content: string): string | undefined {
  const tokens = tokenizeXml(content);
  return tokens === undefined || !isPlistDocument(tokens) ? undefined : removeIgnoredXmlMarkup(content);
}

function removeIgnoredXmlMarkup(content: string): string {
  let text = content;
  while (XML_COMMENT_PATTERN.test(text)) text = text.replace(XML_COMMENT_PATTERN, "");
  return text.replace(XML_CDATA_PATTERN, "").replace(standardPlistDoctype(), "");
}
