import { existsSync, readFileSync, statSync } from "node:fs";
import { type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { shouldServeSpaIndex } from "./editor-server-helpers.js";

export function serveStaticAsset(staticRoot: string, pathname: string, response: ServerResponse): void {
  const file = resolveStaticAssetPath(staticRoot, pathname);
  if (!existsSync(file)) {
    sendText(response, 404, "Editor assets are missing. Run pnpm build first.");
    return;
  }
  const type = contentType(file);
  if (type === undefined) {
    sendText(response, 404, "Editor asset type is not supported.");
    return;
  }
  response.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff" });
  response.end(readFileSync(file));
}

export function resolveStaticAssetPath(staticRoot: string, pathname: string): string {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(staticRoot, relativePath);
  const index = join(staticRoot, "index.html");
  const withinRoot = candidate === staticRoot || candidate.startsWith(`${staticRoot}${sep}`);
  if (!withinRoot) {
    return index;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return shouldServeSpaIndex(pathname) ? index : candidate;
}

export function outputFileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? "output.rexp";
}

function sendText(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(value);
}

function contentType(path: string): string | undefined {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
}
