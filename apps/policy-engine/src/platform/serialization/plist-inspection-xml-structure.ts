/** Recognizes only a closed plist element tree and the fixed public DTD. */
import { isIgnoredXmlToken, isPermittedPlistPrologue, xmlElement } from "./plist-inspection-xml-syntax.js";

interface PlistDocumentState {
  elements: string[];
  sawRoot: boolean;
}

export function isPlistDocument(tokens: string[]): boolean {
  const state: PlistDocumentState = { elements: [], sawRoot: false };
  for (const token of tokens) {
    if (isIgnoredXmlToken(token)) continue;
    if (isPermittedPlistPrologue(token) && isBeforeRoot(state)) continue;
    if (!acceptElement(state, token)) return false;
  }
  return state.sawRoot && state.elements.length === 0;
}

function isBeforeRoot(state: PlistDocumentState): boolean {
  return !state.sawRoot && state.elements.length === 0;
}

function acceptElement(state: PlistDocumentState, token: string): boolean {
  const element = xmlElement(token);
  if (element === undefined) return false;
  if (state.sawRoot) return false;
  if (isBeforeRoot(state) && element.name !== "plist") return false;
  if (element.closes) return closeElement(state, element.name);
  if (element.selfClosing) return !isBeforeRoot(state);
  state.elements.push(element.name);
  return true;
}

function closeElement(state: PlistDocumentState, name: string): boolean {
  if (state.elements.pop() !== name) return false;
  if (state.elements.length === 0) state.sawRoot = true;
  return true;
}
