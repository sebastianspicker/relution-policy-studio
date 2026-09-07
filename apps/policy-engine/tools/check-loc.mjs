/** Enforce the physical-line ceiling for handwritten first-party source files. */
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const MAX_PHYSICAL_LINES = 600;
const HANDWRITTEN_EXTENSIONS = new Set([
  ".bash",
  ".cjs",
  ".css",
  ".cts",
  ".es",
  ".es6",
  ".fish",
  ".htm",
  ".html",
  ".js",
  ".jsx",
  ".ksh",
  ".mjs",
  ".mts",
  ".py",
  ".pyi",
  ".sh",
  ".ts",
  ".tsx",
  ".zsh",
]);
const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".repowise",
  "build",
  "coverage",
  "dist",
  "dist-demo",
  "dist-web",
  "generated",
  "node_modules",
  "out",
  "third_party",
  "vendor",
  "vendored",
]);

function repositoryFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error("Unable to enumerate tracked and non-ignored repository files.");
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isExcluded(filePath) {
  return filePath.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function isHandwrittenSource(filePath) {
  if (HANDWRITTEN_EXTENSIONS.has(extname(filePath).toLowerCase())) return true;
  if (extname(filePath) !== "") return false;
  const firstLine = readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0] ?? "";
  return /^#!.*\b(?:(?:ba|da|k|z)?sh|fish)\b/.test(firstLine);
}

function physicalLines(contents) {
  if (contents.length === 0) return 0;
  const lines = contents.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(contents) ? lines - 1 : lines;
}

const checked = [];
for (const filePath of repositoryFiles()) {
  if (!existsSync(filePath) || isExcluded(filePath) || !isHandwrittenSource(filePath)) continue;
  checked.push({ filePath, lines: physicalLines(readFileSync(filePath, "utf8")) });
}

const violations = checked
  .filter(({ lines }) => lines > MAX_PHYSICAL_LINES)
  .sort((left, right) => right.lines - left.lines || left.filePath.localeCompare(right.filePath));

if (violations.length > 0) {
  console.error(`LOC ceiling failed: ${violations.length} file(s) exceed ${MAX_PHYSICAL_LINES} physical lines.`);
  for (const { filePath, lines } of violations) console.error(`${String(lines).padStart(5)}  ${filePath}`);
  process.exitCode = 1;
} else {
  console.log(`LOC ceiling passed: ${checked.length} handwritten files, none above ${MAX_PHYSICAL_LINES} physical lines.`);
}
