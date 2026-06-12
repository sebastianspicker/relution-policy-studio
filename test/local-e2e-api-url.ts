export function localEditorApiUrl(baseUrlValue: string, path: string): URL {
  const base = new URL(baseUrlValue);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error(`Dashboard E2E editor URL must use http or https: ${baseUrlValue}`);
  }
  if (!isLoopbackHost(base.hostname)) {
    throw new Error(`Dashboard E2E editor URL must be loopback: ${base.hostname}`);
  }
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("//") || !path.startsWith("/api/")) {
    throw new Error(`Unexpected dashboard E2E API path: ${path}`);
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error(`Dashboard E2E API path escaped test server origin: ${path}`);
  }
  return url;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}
