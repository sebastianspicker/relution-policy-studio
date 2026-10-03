/** Fail when source code reaches into another app instead of using its declared package entry points. */
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = join(root, 'apps');
const sourceExtensions = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const configFile = /\.config\.(?:[cm]?js|ts)$/;
const skippedDirectories = new Set(['node_modules', '.venv', '.git']);
const importPatterns = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
  /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
  /\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
];

function sourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, {withFileTypes: true});
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return skippedDirectories.has(entry.name) || entry.name.startsWith('dist') ? [] : sourceFiles(path);
    }
    return sourceExtensions.test(entry.name) ? [path] : [];
  });
}

const apps = readdirSync(appsDir).filter(name => statSync(join(appsDir, name)).isDirectory());
/** Workspace package names; third-party packages such as ajv/dist/2020.js are out of scope. */
const workspacePackages = apps.map(app => JSON.parse(readFileSync(join(appsDir, app, 'package.json'), 'utf8')).name);

/** Entry points each consumer directory may import; other consumers, including the package itself, import none. */
const allowedEntryPoints = {
  'rexp-studio': {
    'apps/workbench': ['browser', 'ui'],
    tools: ['host'],
    tests: ['host', 'testing'],
  },
};

/** Config files sitting directly in a directory, such as vite.config.ts or eslint.config.mjs. */
function configFiles(directory) {
  return readdirSync(directory)
    .filter(name => configFile.test(name))
    .map(name => join(directory, name));
}

function scannedFiles() {
  const appRoots = apps.flatMap(app => ['src', 'web', 'tests', 'tools'].map(part => join(appsDir, app, part)));
  const roots = [...appRoots, join(root, 'tests'), join(root, 'tools')];
  const configs = [root, ...apps.map(app => join(appsDir, app))].flatMap(configFiles);
  return [...roots.flatMap(sourceFiles), ...configs];
}

function specifiersOf(file) {
  const source = readFileSync(file, 'utf8');
  return [...new Set(importPatterns.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[2])))];
}

/** Returns the owning app directory, or undefined for root files. */
function appOf(path) {
  const inside = relative(appsDir, path);
  if (inside.startsWith('..') || inside === '') return undefined;
  return join(appsDir, inside.split(sep)[0]);
}

function isWithin(path, directory) {
  const inside = relative(directory, path);
  return inside === '' || (!inside.startsWith('..') && !inside.startsWith(sep));
}

function violationOf(file, specifier) {
  const ownApp = appOf(file);
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const target = resolve(dirname(file), specifier);
    if (ownApp === undefined && isWithin(target, appsDir))
      return 'root code reaches into apps/ instead of a package entry point';
    if (ownApp !== undefined && !isWithin(target, ownApp)) return 'relative import leaves its own app';
    return undefined;
  }
  const workspacePackage = workspacePackages.find(name => specifier === name || specifier.startsWith(`${name}/`));
  if (workspacePackage === undefined) return undefined;
  if (/\/dist(?:-web|-demo)?\//.test(specifier)) return "imports another app's build output";
  const consumers = allowedEntryPoints[workspacePackage];
  if (consumers === undefined) return undefined;
  const path = relative(root, file).split(sep).join('/');
  const consumer = Object.keys(consumers).find(directory => path.startsWith(`${directory}/`));
  const entryPoint = specifier.slice(workspacePackage.length + 1);
  if (consumer === undefined || !consumers[consumer].includes(entryPoint))
    return `${consumer ?? 'this directory'} may not import this entry point`;
  return undefined;
}

const violations = [];
let scanned = 0;
for (const file of scannedFiles()) {
  scanned++;
  for (const specifier of specifiersOf(file)) {
    const reason = violationOf(file, specifier);
    if (reason !== undefined) violations.push(`${relative(root, file)}: ${specifier} (${reason})`);
  }
}

if (violations.length > 0) {
  console.error(`Boundary check failed with ${violations.length} violation(s):`);
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Boundary check passed for ${scanned} source files.`);
}
