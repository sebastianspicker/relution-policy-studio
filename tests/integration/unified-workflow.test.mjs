import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, readFile, writeFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const planner = join(root, 'apps/planner');
import {startEditorServer, initializeEmptyEditorWorkspace, loadTemplateBundle} from 'rexp-studio/testing';
const canonical = v =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map(k => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const digest = v =>
  createHash('sha256')
    .update(canonical(v) + '\n')
    .digest('hex');
async function fixture(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'campusweave-unified-'));
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
      planner: {pythonExecutable: join(planner, '.venv/bin/python'), cwd: planner, ...overrides},
    },
  };
  const handle = await startEditorServer(options);
  const call = async (path, body, expected = 200) => {
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
    options,
    handle,
    call,
    close: async () => {
      await handle.close();
      await rm(dir, {recursive: true, force: true});
    },
  };
}

test('create, edit, map, project, build, associate evidence, export and reopen use real local contracts', async () => {
  const f = await fixture();
  try {
    const html = await fetch(f.handle.url);
    assert.match(await html.text(), /Relution Policy Studio/);
    const reference = await f.call('/api/campusweave/planner', {command: 'reference', payload: {}});
    assert.equal(reference.result.schema_version, 2);
    const profile = JSON.parse(await readFile(join(root, 'contracts/fixtures/planner-v2-custom.json'), 'utf8'));
    let {project} = await f.call('/api/campusweave/projects', {name: 'Synthetic integration institution', profile});
    assert.equal(project.revision, 1);
    project.profile.intents[0].outcome = 'Author and review a bounded synthetic policy';
    const compiled = await f.call('/api/campusweave/planner', {
      command: 'compile',
      payload: {profile: project.profile},
    });
    assert.equal(compiled.result.profile_digest, digest(project.profile));
    assert.equal(compiled.result.valid, true);
    project.compiled_plan = compiled.result;
    ({project} = await f.call('/api/campusweave/project', {project, expectedRevision: 1}));
    const made = await f.call('/api/campusweave/workspaces', {
      projectId: project.id,
      expectedRevision: project.revision,
      name: 'Synthetic iOS policy',
      platform: 'IOS',
    });
    project = made.project;
    let state = await f.call('/api/state');
    assert.equal(state.active_workspace_id, made.workspace.id);
    const template = state.bundle.configurationTypes.find(t => t.platforms.includes('IOS'));
    assert.ok(template);
    const added = await f.call('/api/add-configuration', {
      policyPath: state.workspace.policies[0].path,
      versionIndex: 0,
      type: template.type,
      expectedRevision: state.revision,
    });
    state = await f.call('/api/state');
    const policy = state.workspace.policies[0];
    const config = policy.document.versions[0].configurations.at(-1);
    const field = Object.keys(config.details).find(
      k => !['type', 'uuid', '__proto__', 'constructor', 'prototype'].includes(k),
    );
    assert.ok(field, 'Fixture requires a real editable defaulted field');
    project.mappings = [
      {
        id: 'synthetic-mapping',
        intent_id: profile.intents[0].id,
        workspace_id: made.workspace.id,
        policy_id: policy.path,
        configuration_id: config.uuid,
        field,
        value: config.details[field],
        platform: 'IOS',
        configuration_type: template.type,
        applicability: 'Synthetic fixture only',
        reviewed: true,
        profile_digest: digest(project.profile),
        policy_revision: state.revision,
      },
    ];
    ({project} = await f.call('/api/campusweave/project', {project, expectedRevision: project.revision}));
    const projected = await f.call('/api/campusweave/projection', {
      projectId: project.id,
      expectedRevision: project.revision,
      mappingId: 'synthetic-mapping',
      expectedWorkspaceRevision: state.revision,
    });
    state = await f.call('/api/state');
    assert.equal(projected.revision, state.revision);
    const checked = await f.call('/api/workspace/validate', {workspace: state.workspace});
    assert.equal(checked.validation.ok, true);
    const build = await f.call('/api/build', {});
    assert.equal(build.validation.ok, true);
    const archive = await fetch(new URL('/api/output', f.handle.url), {
      headers: {'x-rexp-studio-token': f.handle.apiToken},
    });
    assert.equal(archive.status, 200);
    const bytes = Buffer.from(await archive.arrayBuffer());
    assert.ok(bytes.length > 0);
    project.mappings[0].policy_revision = state.revision;
    project.evidence = [
      {
        id: 'local-validation',
        name: 'Synthetic archive round trip',
        intent_id: profile.intents[0].id,
        workspace_id: made.workspace.id,
        requirement_id: 'setting.baseline',
        kind: 'local',
        profile_digest: digest(project.profile),
        policy_revision: state.revision,
        artifact_digest: createHash('sha256').update(bytes).digest('hex'),
        catalog_digest: compiled.result.catalog_digest,
      },
    ];
    ({project} = await f.call('/api/campusweave/project', {project, expectedRevision: project.revision}));
    const exported = await f.call('/api/campusweave/review', {
      projectId: project.id,
      expectedRevision: project.revision,
    });
    assert.equal(exported.review.complete, false, 'local-only evidence cannot complete deployment review');
    assert.ok(exported.review.unresolved.length > 0);
    assert.ok(
      JSON.stringify(exported).includes(project.profile.intents[0].outcome),
      'export includes profile contents',
    );
    const reopened = await f.call('/api/campusweave/project?id=' + project.id);
    assert.deepEqual(reopened.project, project);
    project.mappings[0].field = 'notDeclaredBySchema';
    ({project} = await f.call('/api/campusweave/project', {project, expectedRevision: project.revision}));
    const invalidMapping = await f.call('/api/campusweave/review', {
      projectId: project.id,
      expectedRevision: project.revision,
    });
    assert.equal(invalidMapping.review.mappings[0].projectable, false);
    assert.ok(invalidMapping.review.mappings[0].reasons.some(reason => reason.includes('not declared')));
    const roundTrip = await f.call('/api/import', {
      dataBase64: bytes.toString('base64'),
      key: 'synthetic-local-test-passphrase',
      expectedRevision: state.revision,
    });
    assert.ok(roundTrip.workspace.policies.length > 0);
    await f.call('/api/campusweave/project', {project, expectedRevision: project.revision - 1}, 409);
  } finally {
    await f.close();
  }
});

test('blank drafts persist, malformed worker input fails, stale/missing evidence remains unresolved', async () => {
  const f = await fixture();
  try {
    let {project} = await f.call('/api/campusweave/projects', {name: 'Blank draft'});
    const compilation = await f.call('/api/campusweave/planner', {
      command: 'compile',
      payload: {profile: project.profile},
    });
    project.compiled_plan = compilation.result;
    ({project} = await f.call('/api/campusweave/project', {project, expectedRevision: project.revision}));
    const result = await f.call('/api/campusweave/review', {projectId: project.id, expectedRevision: project.revision});
    assert.equal(result.review.complete, false);
    const invalid = await fetch(new URL('/api/campusweave/planner', f.handle.url), {
      method: 'POST',
      headers: {
        'x-rexp-studio-token': f.handle.apiToken,
        Origin: new URL(f.handle.url).origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({command: 'compile', payload: {}}),
    });
    assert.ok(invalid.status >= 400);
    const forbidden = await fetch(new URL('/api/campusweave/projects', f.handle.url));
    assert.equal(forbidden.status, 403);
    const crossOrigin = await fetch(new URL('/api/campusweave/projects', f.handle.url), {
      method: 'POST',
      headers: {
        'x-rexp-studio-token': f.handle.apiToken,
        Origin: 'https://example.invalid',
        'content-type': 'application/json',
      },
      body: '{"name":"no"}',
    });
    assert.equal(crossOrigin.status, 403);
  } finally {
    await f.close();
  }
});

test('worker launch failures leave persisted project revisions unchanged', async () => {
  const f = await fixture({pythonExecutable: '/nonexistent/campusweave-python'});
  try {
    const {project} = await f.call('/api/campusweave/projects', {name: 'Worker failure'});
    const response = await fetch(new URL('/api/campusweave/planner', f.handle.url), {
      method: 'POST',
      headers: {
        'x-rexp-studio-token': f.handle.apiToken,
        Origin: new URL(f.handle.url).origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({command: 'reference', payload: {}}),
    });
    assert.ok(response.status >= 400);
    assert.deepEqual((await f.call('/api/campusweave/project?id=' + project.id)).project, project);
  } finally {
    await f.close();
  }
});

test('workspace recovery verifies durable content before completing an interrupted project attachment', async () => {
  const f = await fixture();
  try {
    const {project} = await f.call('/api/campusweave/projects', {name: 'Interrupted attachment'});
    const created = await f.call('/api/campusweave/workspaces', {
      projectId: project.id,
      expectedRevision: project.revision,
      name: 'Durable workspace',
      platform: 'IOS',
    });
    // Reproduce a process interruption after workspace commit and before the final project rename.
    const pending = {
      ...created.project,
      revision: created.project.revision - 1,
      workspace_refs: [],
      operations: created.project.operations.map(({committed_at, ...operation}) => ({...operation, status: 'pending'})),
    };
    await writeFile(join(f.dir, 'store/projects', project.id + '.json'), JSON.stringify(pending) + '\n', {mode: 0o600});
    assert.equal((await f.call('/api/campusweave/project?id=' + project.id)).project.operations[0].status, 'pending');
    const recovered = await f.call('/api/campusweave/workspaces/recover', {
      projectId: project.id,
      operationId: pending.operations[0].id,
      expectedRevision: pending.revision,
    });
    assert.equal(recovered.project.workspace_refs[0].id, created.workspace.id);
    assert.equal(recovered.project.operations[0].status, 'committed');
    await f.call(
      '/api/campusweave/workspaces/recover',
      {projectId: project.id, operationId: pending.operations[0].id, expectedRevision: pending.revision},
      409,
    );
    await chmod(join(f.dir, 'store/workspaces'), 0o500);
    let result;
    try {
      result = await f.call(
        '/api/campusweave/workspaces',
        {
          projectId: project.id,
          expectedRevision: recovered.project.revision,
          name: 'Interrupted write fixture',
          platform: 'IOS',
        },
        409,
      );
    } finally {
      await chmod(join(f.dir, 'store/workspaces'), 0o700);
    }
    assert.equal(result.transactions.project, 'pending');
    assert.ok(result.transactions.recovery_operation_id);
    assert.equal(result.project.operations.at(-1).status, 'pending');
  } finally {
    await f.close();
  }
});
