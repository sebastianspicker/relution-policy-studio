import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const engine = join(root, 'apps/policy-engine');
const planner = join(root, 'apps/planner');
const workbenchIndex = join(root, 'apps/workbench/dist/index.html');
const legacyIndex = join(engine, 'dist-web/index.html');
import {startEditorServer, initializeEmptyEditorWorkspace, loadTemplateBundle} from 'rexp-studio/testing';
async function fixture(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'campusweave-runtime-'));
  initializeEmptyEditorWorkspace(join(dir, 'scratch'), loadTemplateBundle().serverVersion);
  const options = {
    workspace: join(dir, 'scratch'),
    key: 'synthetic-local-test-passphrase',
    out: join(dir, 'archive.rexp'),
    host: '127.0.0.1',
    port: 0,
    staticRoot: join(root, 'apps/workbench/dist'),
    campusweave: {
      projectRoot: join(dir, 'store'),
      planner: {pythonExecutable: join(planner, '.venv/bin/python'), cwd: planner},
    },
    ...overrides,
  };
  const handle = await startEditorServer(options);
  const send = async (path, body, expected = 200) => {
    const response = await fetch(new URL(path, handle.url), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-rexp-studio-token': handle.apiToken,
        Origin: new URL(handle.url).origin,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  };
  return {
    dir,
    handle,
    send,
    close: async () => {
      await handle.close();
      await rm(dir, {recursive: true, force: true});
    },
  };
}

test('workspace listing and activation report and change the active workspace without touching the project', async () => {
  const f = await fixture();
  try {
    let {project} = await f.send('/api/campusweave/projects', {name: 'Workspace switching'});
    const empty = await f.send('/api/campusweave/workspaces?projectId=' + project.id);
    assert.deepEqual(empty, {workspaces: [], active_workspace_id: null});
    const first = await f.send('/api/campusweave/workspaces', {
      projectId: project.id,
      expectedRevision: project.revision,
      name: 'First',
      platform: 'IOS',
    });
    const second = await f.send('/api/campusweave/workspaces', {
      projectId: project.id,
      expectedRevision: first.project.revision,
      name: 'Second',
      platform: 'IOS',
    });
    project = second.project;
    const listed = await f.send('/api/campusweave/workspaces?projectId=' + project.id);
    assert.deepEqual(
      listed.workspaces.map(w => w.id),
      [first.workspace.id, second.workspace.id],
    );
    assert.deepEqual(listed.workspaces, project.workspace_refs);
    assert.equal(listed.active_workspace_id, second.workspace.id, 'the most recently created workspace is active');
    assert.equal((await f.send('/api/state')).active_workspace_id, second.workspace.id);
    const activated = await f.send('/api/campusweave/workspaces/activate', {
      projectId: project.id,
      workspaceId: first.workspace.id,
    });
    assert.deepEqual(Object.keys(activated).sort(), ['active_workspace_id', 'revision', 'sidecar', 'workspace']);
    assert.equal(activated.active_workspace_id, first.workspace.id);
    assert.equal(activated.revision, first.workspace_revision);
    assert.equal((await f.send('/api/state')).active_workspace_id, first.workspace.id);
    assert.equal(
      (await f.send('/api/campusweave/workspaces?projectId=' + project.id)).active_workspace_id,
      first.workspace.id,
    );
    assert.deepEqual(
      (await f.send('/api/campusweave/project?id=' + project.id)).project,
      project,
      'activation never rewrites the project',
    );
    await f.send('/api/campusweave/workspaces/activate', {projectId: project.id, workspaceId: 'not-attached'}, 400);
    await f.send(
      '/api/campusweave/workspaces/activate',
      {projectId: 'unknown-project', workspaceId: first.workspace.id},
      404,
    );
    await f.send('/api/campusweave/workspaces?projectId=', undefined, 400);
    assert.equal(
      (await f.send('/api/state')).active_workspace_id,
      first.workspace.id,
      'failed activations keep the active workspace',
    );
  } finally {
    await f.close();
  }
});

test('the capability URL carries the editor token only in its fragment', async () => {
  const f = await fixture();
  try {
    assert.equal(f.handle.url, new URL('/', f.handle.url).href);
    assert.ok(!f.handle.url.includes('editorToken'));
    assert.equal(f.handle.browserUrl, `${f.handle.url}#editorToken=${encodeURIComponent(f.handle.apiToken)}`);
    assert.ok(f.handle.browserUrl.includes('#editorToken='));
    assert.equal(
      (await fetch(new URL('/api/campusweave/projects', f.handle.url))).status,
      403,
      'the API needs the token header',
    );
  } finally {
    await f.close();
  }
});

test('the host serves the workbench from staticRoot and the legacy engine UI otherwise', async () => {
  const workbench = await fixture();
  const legacy = await fixture({staticRoot: undefined});
  try {
    const workbenchHtml = await readFile(workbenchIndex, 'utf8'),
      legacyHtml = await readFile(legacyIndex, 'utf8');
    assert.notEqual(workbenchHtml, legacyHtml);
    const served = await fetch(workbench.handle.url);
    assert.equal(served.status, 200);
    assert.equal(await served.text(), workbenchHtml);
    assert.match(served.headers.get('content-type'), /^text\/html/);
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(served.headers.get('x-frame-options'), 'DENY');
    assert.match(served.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(
      await (await fetch(new URL('/some/client/route', workbench.handle.url))).text(),
      workbenchHtml,
      'extensionless routes fall back to the SPA index',
    );
    assert.equal((await fetch(new URL('/missing.js', workbench.handle.url))).status, 404);
    assert.match(workbenchHtml, /Relution Policy Studio/);
    const fallback = await fetch(legacy.handle.url);
    assert.equal(fallback.status, 200);
    assert.equal(await fallback.text(), legacyHtml);
    assert.match(legacyHtml, /REXP Studio/);
  } finally {
    await workbench.close();
    await legacy.close();
  }
});

test('the launcher serves an authenticated workbench and exits cleanly on SIGTERM', async () => {
  const data = await realpath(await mkdtemp(join(tmpdir(), 'campusweave-launch-')));
  const child = spawn(
    process.execPath,
    [join(root, 'tools/runtime/launch.mjs'), '--no-open', '--no-build', '--port', '0', '--data-dir', data],
    {cwd: root, stdio: ['ignore', 'pipe', 'pipe']},
  );
  let stdout = '',
    stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  const exited = new Promise(resolveExit => child.once('exit', (code, signal) => resolveExit({code, signal})));
  try {
    const url = await new Promise((resolveUrl, reject) => {
      const timer = setTimeout(() => reject(new Error('launcher did not print a URL: ' + stdout + stderr)), 30000);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        const match = /running locally: (http:\/\/\S+)/.exec(stdout);
        if (match) {
          clearTimeout(timer);
          resolveUrl(new URL(match[1]));
        }
      });
      exited.then(result => {
        clearTimeout(timer);
        reject(new Error('launcher exited early ' + JSON.stringify(result) + stdout + stderr));
      });
    });
    assert.equal(url.hostname, '127.0.0.1');
    const token = new URLSearchParams(url.hash.slice(1)).get('editorToken');
    assert.ok(token && token.length > 0);
    const index = await fetch(url);
    assert.equal(index.status, 200);
    assert.equal(await index.text(), await readFile(workbenchIndex, 'utf8'));
    const bare = await fetch(new URL('/api/campusweave/projects', url));
    assert.equal(bare.status, 403);
    const projects = await fetch(new URL('/api/campusweave/projects', url), {headers: {'x-rexp-studio-token': token}});
    assert.equal(projects.status, 200);
    const body = await projects.json();
    assert.ok(Array.isArray(body.projects), JSON.stringify(body));
    assert.equal(body.projects.length, 0);
    child.kill('SIGTERM');
    assert.deepEqual(await exited, {code: 0, signal: null});
  } finally {
    child.kill('SIGKILL');
    await rm(data, {recursive: true, force: true});
  }
});

test('rexp --help exits 0 and prints usage', () => {
  const result = spawnSync(process.execPath, [join(engine, 'dist/src/cli.js'), '--help'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rexp/i);
});
