/** Enforce the dependency boundaries that define the modular monolith. */
import { existsSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const importPattern = /(?:\bimport\s*(?:type\s*)?(?:[^"']*?\s+from\s*)?|\bexport\s+(?:type\s+)?[^"']*?\s+from\s*|\bimport\s*\()(["'])([^"']+)\1/g;
const violations = [];
const REQUIRED_PYTHON_LAUNCHERS = new Map([
  ["tools/compare_institution_policy_baseline.py", "institution_policy_comparison.cli"],
]);

const CAPABILITIES = new Set(["platform", "contracts", "workspace", "workspace-state", "archive", "apple", "assurance", "application", "integrations", "editor", "cli", "mdm"]);
const EDITOR_RAW_PERSISTENCE_OWNERS = new Map([
  ["src/editor/editor-workspace-initialization.ts", new Set(["src/workspace-state/persistence.ts"])],
  // Archive publication is a staged saga that must snapshot and restore the
  // composite state around external archive output verification.
  ["src/editor/editor-server-archive-compliance-routes.ts", new Set(["src/workspace-state/persistence.ts"])],
]);
const CAPABILITY_IMPORTS = {
  platform: new Set(["platform"]),
  contracts: new Set(["contracts", "platform"]),
  workspace: new Set(["workspace", "assurance", "apple", "platform", "contracts"]),
  "workspace-state": new Set(["workspace-state", "workspace", "platform", "contracts"]),
  archive: new Set(["archive", "workspace", "platform", "contracts"]),
  apple: new Set(["apple", "platform", "contracts"]),
  assurance: new Set(["assurance", "apple", "archive", "workspace", "platform", "contracts"]),
  application: new Set(["application", "assurance", "apple", "archive", "workspace", "platform", "contracts"]),
  integrations: new Set(["integrations", "platform", "contracts"]),
  editor: new Set(["editor", "application", "assurance", "apple", "archive", "workspace-state", "workspace", "platform", "contracts", "integrations"]),
  cli: new Set(["cli", "editor", "application", "assurance", "apple", "archive", "workspace", "platform", "integrations", "mdm"]),
  mdm: new Set(["mdm", "assurance", "archive", "workspace", "platform"]),
};
// Capability cycles require an explicit architectural decision. There are none today.
const ALLOWED_CAPABILITY_CYCLES = new Set();

function capabilityOf(file) {
  if (!file.startsWith("src/")) return undefined;
  const capability = file.split("/")[1];
  return CAPABILITIES.has(capability) ? capability : undefined;
}

function editorRawPersistenceViolation(importer, target) {
  if (!importer.startsWith("src/editor/")) return undefined;
  if (target !== "src/workspace-state/persistence.ts" && target !== "src/workspace/storage.ts") return undefined;
  if (EDITOR_RAW_PERSISTENCE_OWNERS.get(importer)?.has(target) === true) return undefined;
  return `${importer}: editor code must use the workspace-state editor port instead of raw persistence via ${target}`;
}

function frontendDependencyViolation(importer, target) {
  if (importer.startsWith("web/src/shared/") && target.startsWith("web/src/features/")) {
    return `${importer}: shared contracts and utilities must not depend on product features via ${target}`;
  }
  if (importer.startsWith("web/src/ui/") && target.startsWith("web/src/features/")) {
    return `${importer}: reusable UI must not depend on product feature orchestration via ${target}`;
  }
  if (importer.startsWith("web/src/features/") && target.startsWith("web/src/app/")) {
    return `${importer}: product features must use web/src/shared contracts instead of importing the app shell via ${target}`;
  }
  const importerFeature = featurePackageOf(importer);
  const targetFeature = featurePackageOf(target);
  if (importerFeature !== undefined && targetFeature !== undefined && importerFeature !== targetFeature) {
    return `${importer}: feature package ${importerFeature} must not import sibling feature package ${targetFeature} via ${target}; move shared contracts or utilities to web/src/shared/`;
  }
  return undefined;
}

function compatibilityBarrelViolation(file) {
  if (file.endsWith("/editor-utils.ts")) {
    return `${file}: compatibility utility barrels are not allowed; import the owning shared module directly`;
  }
  return undefined;
}

function featurePackageOf(file) {
  const featureRoot = "web/src/features/";
  if (!file.startsWith(featureRoot)) return undefined;
  const packageName = file.slice(featureRoot.length).split("/")[0];
  return packageName === "" ? undefined : packageName;
}

function runArchitectureRuleSelfTest() {
  const persistenceCases = [
    ["src/editor/editor-server-workspace-routes.ts", "src/workspace-state/persistence.ts", true],
    ["src/editor/editor-workspace-initialization.ts", "src/workspace-state/persistence.ts", false],
    ["src/editor/editor-server-archive-compliance-routes.ts", "src/workspace-state/persistence.ts", false],
    ["src/editor/editor-server-workspace-routes.ts", "src/workspace/storage.ts", true],
  ];
  for (const [importer, target, expectedViolation] of persistenceCases) {
    if ((editorRawPersistenceViolation(importer, target) !== undefined) !== expectedViolation) {
      throw new Error(`Architecture rule self-test failed for ${importer} -> ${target}`);
    }
  }
  const frontendCases = [
    ["web/src/ui/ConfigurationPickerModal.tsx", "web/src/features/policy-workspace/configuration-picker-options.ts", true],
    ["web/src/features/policy-workspace/ProvenanceStrip.tsx", "web/src/app/SectionRoute.ts", true],
    ["web/src/app/EditorShell.tsx", "web/src/features/policy-workspace/ProvenanceStrip.tsx", false],
    ["web/src/features/policy-workspace/ProvenanceStrip.tsx", "web/src/shared/application-sections.ts", false],
    ["web/src/features/settings/SettingsPanel.tsx", "web/src/features/policy-workspace/ThemeSwitcher.tsx", true],
    ["web/src/features/settings/theme.ts", "web/src/features/settings/theme-contract.ts", false],
    ["web/src/shared/editor-controller-action-contracts.ts", "web/src/features/assurance/editor-compliance-state-contract.ts", true],
  ];
  for (const [importer, target, expectedViolation] of frontendCases) {
    if ((frontendDependencyViolation(importer, target) !== undefined) !== expectedViolation) {
      throw new Error(`Architecture rule self-test failed for ${importer} -> ${target}`);
    }
  }
  const compatibilityBarrelCases = [
    ["web/src/shared/editor-utils.ts", true],
    ["web/src/shared/editor-record-utils.ts", false],
  ];
  for (const [file, expectedViolation] of compatibilityBarrelCases) {
    if ((compatibilityBarrelViolation(file) !== undefined) !== expectedViolation) {
      throw new Error(`Architecture compatibility-barrel self-test failed for ${file}`);
    }
  }
  console.log("Architecture rule self-test passed.");
}

if (process.argv.includes("--self-test")) runArchitectureRuleSelfTest();

function repositoryFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || "Unable to enumerate repository files");
  return result.stdout.split("\0").filter(Boolean);
}

function importsOf(file) {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  return [...source.matchAll(importPattern)].map((match) => ({
    specifier: match[2],
    typeOnly: /^\s*(?:import|export)\s+type\b/u.test(match[0]),
  }));
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const unresolved = resolve(ROOT, importer, "..", specifier);
  const candidates = [unresolved];
  if (extname(unresolved) === ".js") {
    candidates.push(unresolved.slice(0, -3) + ".ts", unresolved.slice(0, -3) + ".tsx");
  } else if (extname(unresolved) === "") {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(unresolved + extension, resolve(unresolved, `index${extension}`));
  }
  const found = candidates.find((candidate) => existsSync(candidate));
  return found === undefined ? undefined : relative(ROOT, found);
}

function stronglyConnectedComponents(graph) {
  let index = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  function visit(node) {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const neighbor of graph.get(node) ?? []) {
      if (!graph.has(neighbor)) continue;
      if (!indices.has(neighbor)) {
        visit(neighbor);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(neighbor)));
      }
    }
    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    components.push(component);
  }

  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return components;
}

const files = repositoryFiles().filter((file) => existsSync(resolve(ROOT, file)));
const productionTypeScript = files.filter((file) => /^(?:src|web\/src)\/.+\.(?:ts|tsx)$/u.test(file));
const graph = new Map(productionTypeScript.map((file) => [file, []]));
const capabilityGraph = new Map([...CAPABILITIES].map((capability) => [capability, []]));

for (const file of productionTypeScript.filter((candidate) => /^src\/[^/]+\.ts$/u.test(candidate) && candidate !== "src/cli.ts")) {
  violations.push(`${file}: root source files are reserved for the CLI composition entry point`);
}

for (const file of productionTypeScript) {
  const barrelViolation = compatibilityBarrelViolation(file);
  if (barrelViolation !== undefined) violations.push(barrelViolation);
  for (const { specifier } of importsOf(file)) {
    if (file.startsWith("web/src/") && specifier.startsWith("node:")) {
      violations.push(`${file}: browser code imports Node module ${specifier}`);
    }
    const target = resolveLocalImport(file, specifier);
    if (target === undefined) continue;
    graph.get(file).push(target);
    const persistenceViolation = editorRawPersistenceViolation(file, target);
    if (persistenceViolation !== undefined) violations.push(persistenceViolation);
    const frontendViolation = frontendDependencyViolation(file, target);
    if (frontendViolation !== undefined) violations.push(frontendViolation);
    if (file.startsWith("web/src/") && target.startsWith("src/") && !target.startsWith("src/browser/")) {
      violations.push(`${file}: browser code bypasses src/browser via ${target}`);
    }
    const importerCapability = capabilityOf(file);
    const targetCapability = capabilityOf(target);
    // src/browser is a deliberate projection boundary. Its dependencies are
    // checked by the browser-reachability walk below, not the server DAG.
    if (importerCapability !== undefined && targetCapability !== undefined && !file.startsWith("src/browser/")) {
      capabilityGraph.get(importerCapability).push(targetCapability);
      if (!CAPABILITY_IMPORTS[importerCapability].has(targetCapability)) {
        violations.push(`${file}: ${importerCapability} must not import ${targetCapability} via ${target}`);
      }
    }
  }
}

for (const component of stronglyConnectedComponents(graph)) {
  if (component.length > 1) violations.push(`TypeScript dependency cycle: ${component.sort().join(" -> ")}`);
  if (component.length === 1 && graph.get(component[0]).includes(component[0])) {
    violations.push(`TypeScript self-cycle: ${component[0]}`);
  }
}

for (const component of stronglyConnectedComponents(capabilityGraph)) {
  if (component.length < 2) continue;
  const key = [...component].sort().join(" <-> ");
  if (!ALLOWED_CAPABILITY_CYCLES.has(key)) {
    violations.push(`Capability dependency cycle: ${key}`);
  }
}

const browserReachable = new Set();
const browserQueue = productionTypeScript.filter((file) => file.startsWith("web/src/") || file.startsWith("src/browser/"));
while (browserQueue.length > 0) {
  const file = browserQueue.pop();
  if (browserReachable.has(file)) continue;
  browserReachable.add(file);
  for (const { specifier, typeOnly } of importsOf(file)) {
    if (typeOnly) continue;
    if (specifier.startsWith("node:")) violations.push(`${file}: Node module ${specifier} is reachable from the browser graph`);
    const target = resolveLocalImport(file, specifier);
    if (target !== undefined && graph.has(target)) browserQueue.push(target);
  }
}

for (const file of files.filter((candidate) => candidate.endsWith(".py"))) {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  if (/(?:^|[_-])(?:part|group|chunk|segment|shard|split|module|section)[_-]?\d+(?:[_-]|\.py$)/u.test(file)) {
    violations.push(`${file}: numbered split module has no domain meaning`);
  }
  if (/^\s*from\s+[^\n]+\s+import\s+\*/mu.test(source)) violations.push(`${file}: wildcard import obscures ownership`);
  if (file.startsWith("tools/_") && /^\s*(?:from|import)\s+(?:tools\.)?(?:recommendation_mapping|build_relution_import_artifacts)\b/mu.test(source)) {
    violations.push(`${file}: implementation imports a public tool facade`);
  }
}

const pythonFiles = files.filter((file) => file.endsWith(".py"));
const pythonModuleFiles = new Map();
for (const file of pythonFiles) {
  const module = file.slice(0, -3).replaceAll("/", ".").replace(/\.__init__$/u, "");
  pythonModuleFiles.set(module, file);
  if (module.startsWith("tools.")) pythonModuleFiles.set(module.slice("tools.".length), file);
}

function pythonModuleOf(file) {
  return file.slice(0, -3).replaceAll("/", ".").replace(/\.__init__$/u, "").replace(/^tools\./u, "");
}

function pythonImportsOf(file) {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  const current = pythonModuleOf(file);
  const packageParts = file.endsWith("/__init__.py") ? current.split(".") : current.split(".").slice(0, -1);
  const imports = [];
  for (const match of source.matchAll(/^\s*from\s+([.\w]+)\s+import\s+/gmu)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) {
      imports.push(specifier);
      continue;
    }
    const dots = specifier.match(/^\.+/u)[0].length;
    const remainder = specifier.slice(dots);
    const prefix = packageParts.slice(0, Math.max(0, packageParts.length - dots + 1));
    imports.push([...prefix, ...remainder.split(".").filter(Boolean)].join("."));
  }
  for (const match of source.matchAll(/^\s*import\s+([\w.]+)/gmu)) imports.push(match[1]);
  for (const match of source.matchAll(/import_module\(\s*["']([\w.]+)["']\s*\)/gu)) imports.push(match[1]);
  return imports;
}

const pythonGraph = new Map(pythonFiles.map((file) => [file, []]));
const publicPythonFacadeFiles = new Set(
  pythonFiles.filter((file) => /^tools\/[^/_][^/]*\.py$/u.test(file)),
);
for (const file of pythonFiles) {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  const importLines = source.match(/^\s*from\s+[.\w]+\s+import\s+.+$/gmu) ?? [];
  const definitions = /^\s*(?:async\s+)?def\s+|^\s*class\s+/mu.test(source);
  if (file.startsWith("tools/_") && /_(?:shared|helpers|analysis|artifacts)\.py$/u.test(file) && !definitions && importLines.length > 0) {
    violations.push(`${file}: internal dependency sack re-exports imports instead of owning behavior`);
  }
  for (const imported of pythonImportsOf(file)) {
    const target = pythonModuleFiles.get(imported);
    if (target === undefined) continue;
    pythonGraph.get(file).push(target);
    if (file.startsWith("tools/") && file !== target && !publicPythonFacadeFiles.has(file) && publicPythonFacadeFiles.has(target)) {
      violations.push(`${file}: implementation imports public tool facade ${target}`);
    }
  }
}

for (const [file, module] of REQUIRED_PYTHON_LAUNCHERS) {
  if (!pythonFiles.includes(file)) continue;
  const source = readFileSync(resolve(ROOT, file), "utf8");
  const expectedImport = new RegExp(`^from ${module.replaceAll(".", "\\.")} import main$`, "mu");
  if (!expectedImport.test(source)) {
    violations.push(`${file}: public launcher must import main directly from ${module}`);
  }
  if (/^\s*(?:async\s+)?def\s+/mu.test(source) || /^\s*class\s+/mu.test(source)) {
    violations.push(`${file}: public launcher must delegate instead of implementing behavior`);
  }
}

for (const component of stronglyConnectedComponents(pythonGraph)) {
  if (component.length > 1) violations.push(`Python import cycle: ${component.sort().join(" -> ")}`);
  if (component.length === 1 && pythonGraph.get(component[0]).includes(component[0])) {
    violations.push(`Python self-cycle: ${component[0]}`);
  }
}

const reachablePython = new Set();
const pythonQueue = pythonFiles.filter((file) => /^tools\/[^/_][^/]*\.py$/u.test(file));
while (pythonQueue.length > 0) {
  const file = pythonQueue.pop();
  if (reachablePython.has(file)) continue;
  reachablePython.add(file);
  for (const target of pythonGraph.get(file) ?? []) pythonQueue.push(target);
}
for (const file of pythonFiles) {
  const isToolImplementation = file.startsWith("tools/")
    && !file.endsWith("/__init__.py")
    && (file.startsWith("tools/_") || file.includes("/"));
  if (isToolImplementation && !reachablePython.has(file)) {
    violations.push(`${file}: unreachable tool implementation module`);
  }
}

if (violations.length > 0) {
  console.error(`Architecture check failed with ${violations.length} violation(s):`);
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture check passed for ${productionTypeScript.length} TypeScript and ${files.filter((file) => file.endsWith(".py")).length} Python files.`);
}
