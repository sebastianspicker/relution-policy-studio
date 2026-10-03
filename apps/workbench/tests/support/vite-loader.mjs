import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
// Loads workbench TypeScript sources through Vite's SSR transform so relative
// and bare specifiers resolve exactly as they do in the real build.
const root = fileURLToPath(new URL('../..', import.meta.url));
export async function loadWorkbenchModules(...paths) {
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: {noDiscovery: true, include: []},
    server: {middlewareMode: true, hmr: false, watch: null},
  });
  try {
    return await Promise.all(paths.map(path => server.ssrLoadModule(path)));
  } finally {
    await server.close();
  }
}
