import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [task, ...taskArgs] = process.argv.slice(2);

const PLANNER = 'apps/planner';
const ENGINE = 'apps/policy-engine';
const WORKBENCH = 'apps/workbench';

/** Run one command inside a repository-relative directory and stop the task on the first failure. */
function run(command, args, cwd = '') {
  const result = spawnSync(command, args, {cwd: join(root, cwd), stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Run each step in order, printing its label first; a step with `eachFile` runs once per listed file. */
function runSteps(steps) {
  for (const {label, command, args, cwd, eachFile} of steps) {
    console.log(`\n==> ${label}`);
    if (eachFile === undefined) run(command, args, cwd);
    else for (const file of eachFile) run(command, [...args, file], cwd);
  }
}

/** Files below `directories` of a repository-relative app whose names match `pattern`, relative to that app. */
function appFiles(app, directories, pattern) {
  return directories
    .flatMap(directory => readdirSync(join(root, app, directory), {recursive: true, withFileTypes: true}))
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => relative(join(root, app), join(entry.parentPath, entry.name)))
    .sort();
}

function plannerUv(...args) {
  return {command: 'uv', args: ['run', '--locked', ...args], cwd: PLANNER};
}

function verifySteps() {
  return [
    {label: 'Workspace boundaries', command: 'node', args: ['tools/check-boundaries.mjs']},
    {label: 'Format check', command: 'pnpm', args: ['format:check']},
    {label: 'Unused code and dependencies (knip)', command: 'pnpm', args: ['knip']},
    {label: 'Planner: ruff check', ...plannerUv('ruff', 'check', '.')},
    {label: 'Planner: ruff format', ...plannerUv('ruff', 'format', '--check', 'campusweave', 'scripts')},
    {label: 'Planner: pyright', ...plannerUv('pyright')},
    {label: 'Planner: node lint', command: 'pnpm', args: ['lint'], cwd: PLANNER},
    {label: 'Planner: machine docs', ...plannerUv('python', 'scripts/validate_machine_docs.py')},
    {label: 'Planner: shell syntax', command: 'zsh', args: ['-n', 'scripts/relution_curl.zsh'], cwd: PLANNER},
    {
      label: 'Planner: web script syntax',
      command: 'node',
      args: ['--check'],
      eachFile: appFiles(PLANNER, ['web'], /\.m?js$/),
      cwd: PLANNER,
    },
    {
      label: 'Planner: python syntax',
      command: join(root, PLANNER, '.venv/bin/python'),
      args: ['-m', 'py_compile', ...appFiles(PLANNER, ['campusweave', 'scripts'], /\.py$/)],
      cwd: PLANNER,
    },
    {label: 'Policy engine: verify:ci', command: 'pnpm', args: ['verify:ci'], cwd: ENGINE},
    {label: 'Policy engine: demo build', command: 'pnpm', args: ['build:demo'], cwd: ENGINE},
    {label: 'Workbench: build', command: 'pnpm', args: ['build'], cwd: WORKBENCH},
  ];
}

if (task === 'setup') {
  runSteps([
    {label: 'Install JavaScript workspace', command: 'pnpm', args: ['install', '--frozen-lockfile']},
    {label: 'Sync planner environment', command: 'uv', args: ['sync', '--locked', '--extra', 'dev'], cwd: PLANNER},
    {label: 'Sync policy engine environment', command: 'uv', args: ['sync', '--locked'], cwd: ENGINE},
  ]);
} else if (task === 'build') {
  runSteps([
    {label: 'Build policy engine', command: 'pnpm', args: ['build'], cwd: ENGINE},
    {label: 'Build workbench', command: 'pnpm', args: ['build'], cwd: WORKBENCH},
  ]);
} else if (task === 'planner') {
  if (taskArgs[0] === 'serve') {
    if (taskArgs.length !== 1) throw new Error('planner serve does not accept options');
    run('uv', ['run', '--locked', 'python', '-m', 'campusweave'], PLANNER);
  } else {
    const plannerArgs = taskArgs.length ? taskArgs : ['--help'];
    run('uv', ['run', '--locked', 'python', 'scripts/campusweave_runtime.py', ...plannerArgs], PLANNER);
  }
} else if (task === 'rexp') {
  run('pnpm', ['rexp', ...taskArgs], ENGINE);
} else if (task === 'verify') {
  runSteps(verifySteps());
} else {
  throw new Error(`Unknown task ${task}`);
}
