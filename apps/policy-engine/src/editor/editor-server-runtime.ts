/** Starts and stops the authenticated local editor HTTP runtime. */
import { createServer } from "node:http";
import { loadAppleSchemaCatalog } from "../apple/apple-schema-catalog.js";
import { normalizeHttpHostname } from "../platform/network/connection-normalization.js";
import { createNetworkApiToken } from "./editor-api-request-guards.js";
import { configureEditorHttpServer } from "./editor-http-server-config.js";
import { validateEditorKeyForOutput } from "./editor-key-validation.js";
import { assertSafeEditorHost, editorUrlWithNetworkToken } from "./editor-loopback-host.js";
import { closeEditorMutationQueues, createEditorMutationQueues } from "./editor-mutation-routing.js";
import type { EditorRequestContext, EditorRuntimeState, EditorServerHandle, EditorServerOptions } from "./editor-server-contract.js";
import { handleEditorServerError } from "./editor-server-errors.js";
import { handleEditorHttpRequest } from "./editor-server-request.js";
import { loadTemplateBundle } from "../assurance/template-bundle.js";

export async function startEditorServerRuntime(options: EditorServerOptions): Promise<EditorServerHandle> {
  const host = normalizeHttpHostname(options.host ?? "127.0.0.1");
  assertSafeEditorHost(host);
  const bundle = loadTemplateBundle(options.bundlePath);
  const runtimeState: EditorRuntimeState = {
    key: options.key,
    keyValidation: validateEditorKeyForOutput(options.out, options.key),
    relution: { lastDevices: [] },
    zammad: {},
    mutationQueues: createEditorMutationQueues(32),
    networkApiToken: configuredNetworkApiToken(options.apiToken),
  };
  const context: EditorRequestContext = { options, bundle, appleSchema: loadAppleSchemaCatalog(), runtimeState };
  const server = createServer((request, response) => {
    void handleEditorHttpRequest(request, response, context).catch((error: unknown) => handleEditorServerError(response, error));
  });
  configureEditorHttpServer(server);
  await listenEditorServer(server, options.port ?? 8787, host);
  return createEditorServerHandle(server, host, runtimeState);
}

function configuredNetworkApiToken(apiToken: string | undefined): string {
  if (apiToken === undefined) return createNetworkApiToken();
  if (apiToken.length === 0) throw new Error("Editor API token must not be empty");
  return apiToken;
}

async function listenEditorServer(server: ReturnType<typeof createServer>, port: number, host: string): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function createEditorServerHandle(
  server: ReturnType<typeof createServer>,
  host: string,
  runtimeState: EditorRuntimeState,
): EditorServerHandle {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 8787;
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= closeEditorServer(server, runtimeState);
    return closePromise;
  };
  return {
    url: editorUrlWithNetworkToken(host, port, undefined),
    browserUrl: editorUrlWithNetworkToken(host, port, runtimeState.networkApiToken),
    apiToken: runtimeState.networkApiToken,
    pendingMutationCount: (domain) => runtimeState.mutationQueues[domain].pendingCount,
    close,
  };
}

async function closeEditorServer(server: ReturnType<typeof createServer>, runtimeState: EditorRuntimeState): Promise<void> {
  const closed = new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  });
  await closeEditorMutationQueues(runtimeState.mutationQueues);
  server.closeAllConnections();
  await closed;
}
