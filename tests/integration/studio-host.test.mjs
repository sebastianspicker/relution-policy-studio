import assert from 'node:assert/strict';
import test from 'node:test';
import {chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStudioHost} from 'rexp-studio/host';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const planner = join(root, 'apps/planner');
const staticRoot = join(root, 'apps/workbench/dist');
const plannerOptions = {pythonExecutable: join(planner, '.venv/bin/python'), cwd: planner};

/** Real path of a fresh 0700 temp directory, so platform temp symlinks such as /var -> /private/var are resolved. */
async function privateTemp() {
  return realpath(await mkdtemp(join(tmpdir(), 'campusweave-host-')));
}

function start(dataDir, overrides = {}) {
  return startStudioHost({dataDir, port: 0, staticRoot, planner: plannerOptions, ...overrides});
}

test('the studio host rejects a data directory that is not private', async () => {
  const dir = await privateTemp();
  try {
    const dataDir = join(dir, 'data');
    await mkdir(dataDir, {mode: 0o755});
    await chmod(dataDir, 0o755);
    await assert.rejects(start(dataDir), {message: 'Data directory must be private (mode 0700)'});
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('the studio host rejects a data path that contains a symlink', async () => {
  const dir = await privateTemp();
  try {
    await mkdir(join(dir, 'target'), {mode: 0o700});
    await symlink(join(dir, 'target'), join(dir, 'link'));
    await assert.rejects(start(join(dir, 'link', 'data')), {message: 'Data path must not contain symlinks'});
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('the studio host rejects a missing planner executable', async () => {
  const dir = await privateTemp();
  try {
    await assert.rejects(
      start(join(dir, 'data'), {planner: {pythonExecutable: join(dir, 'missing-python'), cwd: planner}}),
      {message: 'Install planner first: pnpm bootstrap'},
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('the studio host creates private state and serves the planner, project store and review', async () => {
  const dir = await privateTemp();
  const host = await start(dir);
  try {
    for (const name of ['scratch-workspace', 'projects']) {
      const info = await stat(join(dir, name));
      assert.ok(info.isDirectory(), name);
      assert.equal(info.mode & 0o777, 0o700, name);
    }
    assert.ok(host.browserUrl.includes('#editorToken='));
    const url = new URL(host.browserUrl);
    const token = new URLSearchParams(url.hash.slice(1)).get('editorToken');
    assert.ok(token && token.length > 0);
    const send = async (path, body, expected = 200) => {
      const response = await fetch(new URL(path, url.origin), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {'x-rexp-studio-token': token, Origin: url.origin, 'Content-Type': 'application/json'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      const value = await response.json();
      assert.equal(response.status, expected, JSON.stringify(value));
      return value;
    };
    const index = await fetch(new URL('/', url.origin));
    assert.equal(index.status, 200);
    assert.equal(await index.text(), await readFile(join(staticRoot, 'index.html'), 'utf8'));
    const reference = await send('/api/campusweave/planner', {command: 'reference', payload: {}});
    assert.equal(reference.result.schema_version, 2);
    const profile = JSON.parse(await readFile(join(root, 'contracts/fixtures/planner-v2-custom.json'), 'utf8'));
    let {project} = await send('/api/campusweave/projects', {name: 'Synthetic host institution', profile});
    assert.equal(project.revision, 1);
    const compiled = await send('/api/campusweave/planner', {command: 'compile', payload: {profile: project.profile}});
    assert.match(compiled.result.catalog_digest, /^[a-f0-9]{64}$/);
    project.compiled_plan = compiled.result;
    ({project} = await send('/api/campusweave/project', {project, expectedRevision: 1}));
    assert.equal(project.revision, 2);
    const {review} = await send('/api/campusweave/review', {projectId: project.id, expectedRevision: project.revision});
    assert.equal(review.complete, false);
    assert.equal(review.deployment_authorized, false);
    await send('/api/campusweave/project', {project, expectedRevision: 1}, 409);
  } finally {
    await host.close();
    await rm(dir, {recursive: true, force: true});
  }
});
