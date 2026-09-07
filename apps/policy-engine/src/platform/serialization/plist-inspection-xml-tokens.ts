/** Tokenizes non-entity XML markup for bounded lexical inspection. */
export function tokenizeXml(content: string): string[] | undefined {
  const tokens: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    const next = content.indexOf("<", offset);
    if (next === -1) return tokens;
    const end = tokenEnd(content, next);
    if (end === undefined) return undefined;
    tokens.push(content.slice(next, end));
    offset = end;
  }
  return tokens;
}

function tokenEnd(content: string, offset: number): number | undefined {
  if (content.startsWith("<!--", offset)) return closingMarkupEnd(content, offset, "-->");
  if (content.startsWith("<![CDATA[", offset)) return closingMarkupEnd(content, offset, "]]>");
  const end = content.indexOf(">", offset + 1);
  return end === -1 ? undefined : end + 1;
}

function closingMarkupEnd(content: string, offset: number, closing: string): number | undefined {
  const end = content.indexOf(closing, offset + closing.length);
  return end === -1 ? undefined : end + closing.length;
}
