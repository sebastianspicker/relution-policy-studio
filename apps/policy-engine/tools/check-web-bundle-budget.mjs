// Enforce release gzip budgets against the actual generated JavaScript and CSS assets.
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = join(process.cwd(), process.argv.includes("--demo") ? "dist-demo" : "dist-web");
const assetDirectory = join(outputDirectory, "assets");
// Signal Desk shell + modular CSS; budgets track measured gzip of the design cutover.
const limits = { js: 129_000, css: 13_000 };
const totals = { js: 0, css: 0 };

for (const fileName of readdirSync(assetDirectory)) {
  const kind = fileName.endsWith(".js") ? "js" : fileName.endsWith(".css") ? "css" : undefined;
  if (kind !== undefined) totals[kind] += gzipSync(readFileSync(join(assetDirectory, fileName))).byteLength;
}

for (const kind of ["js", "css"]) {
  if (totals[kind] > limits[kind]) {
    throw new Error(`${kind.toUpperCase()} gzip bundle ${totals[kind]} bytes exceeds ${limits[kind]} byte release budget`);
  }
}

console.log(`Web bundle budget: JS ${totals.js} / ${limits.js} bytes gzip; CSS ${totals.css} / ${limits.css} bytes gzip`);

const graph = JSON.parse(readFileSync(join(outputDirectory, "editor-dependency-graph.json"), "utf8"));
const deferredRoots = [
  "web/src/features/assurance/BaselinePanel.tsx",
  "web/src/features/assurance/CompliancePanel.tsx",
  "web/src/features/assurance/PolicyWizardPanel.tsx",
  "web/src/features/assurance/RecommendationsPanel.tsx",
  "web/src/features/external-audit/RelutionDashboardPanel.tsx",
  "web/src/features/settings/SettingsPanel.tsx",
];
for (const root of deferredRoots) {
  if (graph.modules.includes(root)) throw new Error(`Deferred panel is in the initial application graph: ${root}`);
  if (!graph.deferredModules.includes(root)) throw new Error(`Deferred panel is missing from generated chunks: ${root}`);
}
const initialBytes = graph.chunks.reduce((total, chunk) => total + chunk.bytes, 0);
const initialGzipBytes = graph.chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
console.log(`Initial ${graph.mode} graph: ${graph.chunks.length} JS chunks, ${initialBytes} bytes, ${initialGzipBytes} bytes gzip; deferred panels absent`);
