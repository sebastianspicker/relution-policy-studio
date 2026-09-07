/** Recognizes permitted plist XML prologue and element token syntax. */
const STANDARD_PLIST_DOCTYPE = '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';
const XML_DECLARATION = /^<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?\s*\?>/u;

export function isIgnoredXmlToken(token: string): boolean {
  return token.startsWith("<!--") || token.startsWith("<![CDATA[");
}

export function isPermittedPlistPrologue(token: string): boolean {
  return XML_DECLARATION.test(token) || token === STANDARD_PLIST_DOCTYPE;
}

export function xmlElement(token: string): { name: string; closes: boolean; selfClosing: boolean } | undefined {
  const match = /^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9._:-]*)(?:\s+[^<>]*)?\s*(\/)?\s*>$/u.exec(token);
  if (match === null) return undefined;
  return { name: match[2]!, closes: match[1] === "/", selfClosing: match[3] === "/" };
}

export function standardPlistDoctype(): string {
  return STANDARD_PLIST_DOCTYPE;
}
