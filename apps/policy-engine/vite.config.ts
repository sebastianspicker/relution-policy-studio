// Build the React workbench from web/ into the static assets served by the local editor.
import { relative } from "node:path";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Include the dynamically bootstrapped App and only its static dependencies. */
function editorDependencyGraph(demo: boolean): Plugin {
  return {
    name: "editor-dependency-graph",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
      const appModule = demo ? "/web/src/demo/DemoApp.tsx" : "/web/src/App.tsx";
      const app = chunks.find((chunk) => Object.keys(chunk.modules).some((id) => id.endsWith(appModule)));
      if (app === undefined) throw new Error(`Missing application chunk for ${appModule}`);
      const pending = [...chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName), app.fileName];
      const initial = new Set<string>();
      while (pending.length > 0) {
        const fileName = pending.pop()!;
        if (initial.has(fileName)) continue;
        const chunk = chunks.find((candidate) => candidate.fileName === fileName);
        if (chunk === undefined) throw new Error(`Missing initial dependency chunk: ${fileName}`);
        initial.add(fileName);
        pending.push(...chunk.imports);
      }
      const initialChunks = chunks.filter((chunk) => initial.has(chunk.fileName));
      this.emitFile({
        type: "asset",
        fileName: "editor-dependency-graph.json",
        source: JSON.stringify({
          mode: demo ? "demo" : "editor",
          chunks: initialChunks.map((chunk) => ({
            file: chunk.fileName,
            bytes: Buffer.byteLength(chunk.code),
            gzipBytes: gzipSync(chunk.code).byteLength,
          })),
          modules: [...new Set(initialChunks.flatMap((chunk) => Object.keys(chunk.modules)))].map(
            (id) => relative(process.cwd(), id).replaceAll("\\", "/"),
          ).sort(),
          deferredModules: [...new Set(chunks.filter((chunk) => !initial.has(chunk.fileName)).flatMap(
            (chunk) => Object.keys(chunk.modules),
          ))].map((id) => relative(process.cwd(), id).replaceAll("\\", "/")).sort(),
        }, null, 2) + "\n",
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    root: "web",
    base: demo ? "/rexp-studio/" : "/",
    plugins: [react({ jsxRuntime: "classic" }), editorDependencyGraph(demo)],
    oxc: {
      jsx: { runtime: "classic", pragma: "__cwElement", pragmaFrag: "__cwFragment" },
      jsxInject: 'import {createElement as __cwElement, Fragment as __cwFragment} from "react";',
    },
    build: {
      outDir: demo ? "../dist-demo" : "../dist-web",
      emptyOutDir: true,
      // Native module loading is sufficient for the authenticated loopback application.
      modulePreload: false,
      minify: "terser",
      terserOptions: {
        compress: { passes: 3, toplevel: true },
        mangle: { toplevel: true },
        format: { semicolons: false, quote_style: 1 },
      },
      rolldownOptions: {
        output: {
          // Oxc compresses module scopes; Terser then formats the final chunks.
          minify: true,
          // Share code across the eagerly loaded editor and across deferred expert panels.
          manualChunks(id, { getModuleInfo }) {
            const visited = new Set<string>();
            const isInitial = (key: string): boolean => {
              if (visited.has(key)) return false;
              visited.add(key);
              if (/\/web\/src\/(main|App|demo\/DemoApp)\.tsx$/u.test(key)) return true;
              return getModuleInfo(key)?.importers.some(isInitial) ?? false;
            };
            if (id.includes("/node_modules/")) return "vendor";
            return !id.includes("/web/src/") || isInitial(id) ? "editor" : "expert";
          },
        },
      },
    },
  };
});
