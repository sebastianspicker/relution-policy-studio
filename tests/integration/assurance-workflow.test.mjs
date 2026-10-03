import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, cp, readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {
  startEditorServer,
  initializeEmptyEditorWorkspace,
  loadTemplateBundle,
  assuranceCanonicalDigest,
} from 'rexp-studio/testing';

const root = resolve(import.meta.dirname, '../..');
const engine = join(root, 'apps/policy-engine');
const artifacts = 'example/recommendation-coverage';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'campusweave-assurance-http-'));
  await mkdir(join(dir, artifacts), {recursive: true});
  await cp(join(engine, artifacts), join(dir, artifacts), {recursive: true});
  initializeEmptyEditorWorkspace(join(dir, 'scratch'), loadTemplateBundle().serverVersion);
  const server = await startEditorServer({
    workspace: join(dir, 'scratch'),
    key: 'synthetic-assurance-test-passphrase',
    out: join(dir, 'review.rexp'),
    port: 0,
    host: '127.0.0.1',
    assuranceRootDir: dir,
    campusweave: {
      projectRoot: join(dir, 'projects'),
      planner: {cwd: join(root, 'apps/planner'), pythonExecutable: join(root, 'apps/planner/.venv/bin/python')},
    },
  });
  const call = async (path, body, status = 200) => {
    const response = await fetch(new URL(path, server.url), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-rexp-studio-token': server.apiToken,
        Origin: new URL(server.url).origin,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    const value = await response.json();
    assert.equal(response.status, status, JSON.stringify(value));
    return value;
  };
  const {project} = await call('/api/campusweave/projects', {name: 'Synthetic assurance integration'});
  const created = await call('/api/campusweave/workspaces', {
    projectId: project.id,
    expectedRevision: project.revision,
    name: 'Synthetic iOS assurance',
    platform: 'IOS',
  });
  const state = await call('/api/state');
  const catalog = await call('/api/assurance/catalog');
  return {
    dir,
    server,
    call,
    state,
    catalog,
    project: created.project,
    close: async () => {
      await server.close();
      await rm(dir, {recursive: true, force: true});
    },
  };
}

function selectionRequest(f) {
  const record = f.catalog.catalog.recommendations.find(
    r =>
      r.selectable &&
      r.platform === 'IOS' &&
      r.mapping?.family === 'relution-native' &&
      r.mapping.target === 'IOS_PASSCODE' &&
      r.parameters.length === 0,
  );
  assert.ok(record, 'The audited source corpus must retain an evidenced iOS passcode recommendation');
  const applicability = {};
  for (const predicate of record.applicability.predicates) {
    if (predicate.field !== 'platform')
      applicability[predicate.field] = Array.isArray(predicate.value) ? predicate.value[0] : predicate.value;
  }
  return {
    workspace: f.state.workspace,
    expectedRevision: f.state.revision,
    target: {policyPath: f.state.workspace.policies[0].path, versionIndex: 0},
    selection: {kind: 'recommendation', recommendationId: record.id},
    applicability,
    acknowledgedSourceDigests: [],
  };
}
async function reviewedPreview(f, input) {
  const initial = await f.call('/api/assurance/preview', input);
  input.acknowledgedSourceDigests = [
    ...new Set([...(input.acknowledgedSourceDigests ?? []), ...initial.unacknowledgedSourceDigests]),
  ];
  return f.call('/api/assurance/preview', input);
}
function applyRequest(input, preview) {
  return {
    ...input,
    draftDigest: preview.draftDigest,
    resultDigest: preview.resultDigest,
    previewDigest: preview.previewDigest,
    assuranceDigest: preview.assuranceDigest,
    resolvedSnapshotDigest: preview.snapshotDigest,
    snapshotSelection: preview.snapshotSelection,
    sourceDigests: preview.sourceDigests,
    ...(preview.presetDigest ? {presetDigest: preview.presetDigest} : {}),
  };
}

async function publishModifiedSnapshot(f, change) {
  const indexPath = join(f.dir, artifacts, 'assurance-snapshots/index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const prior = index.entries.find(entry => entry.snapshotDigest === index.currentSnapshotDigest);
  const catalog = JSON.parse(await readFile(join(f.dir, prior.catalogPath), 'utf8'));
  const presets = JSON.parse(await readFile(join(f.dir, prior.presetsPath), 'utf8'));
  change(catalog, presets);
  presets.catalogDigest = assuranceCanonicalDigest(catalog);
  const snapshotDigest = assuranceCanonicalDigest({catalog, presets});
  const target = join(artifacts, 'assurance-snapshots', snapshotDigest);
  await mkdir(join(f.dir, target), {recursive: true});
  const next = {
    ...prior,
    snapshotDigest,
    catalogDigest: presets.catalogDigest,
    catalogPath: join(target, 'assurance-catalog.json'),
    presetsPath: join(target, 'assurance-presets.json'),
  };
  if (prior.detailsPath) {
    next.detailsPath = join(target, 'assurance-details.json');
    const details = JSON.parse(await readFile(join(f.dir, prior.detailsPath), 'utf8'));
    details.catalogDigest = presets.catalogDigest;
    next.detailsDigest = assuranceCanonicalDigest(details);
    await writeFile(join(f.dir, next.detailsPath), JSON.stringify(details) + '\n');
  }
  await writeFile(join(f.dir, next.catalogPath), JSON.stringify(catalog) + '\n');
  await writeFile(join(f.dir, next.presetsPath), JSON.stringify(presets) + '\n');
  await writeFile(
    indexPath,
    JSON.stringify({...index, currentSnapshotDigest: snapshotDigest, entries: [...index.entries, next]}) + '\n',
  );
  return snapshotDigest;
}

test('one reviewed recommendation produces only its draft and requires a separate save', async () => {
  const f = await fixture();
  try {
    const listing = await f.call('/api/assurance/presets');
    assert.deepEqual(
      listing.presets.map(p => p.id),
      ['essential', 'managed', 'high-assurance'],
    );
    const input = selectionRequest(f);
    input.workspace = structuredClone(input.workspace);
    input.workspace.policies[0].document.description = 'Unrelated unsaved description survives';
    const preview = await reviewedPreview(f, input);
    assert.equal(preview.ready, true, JSON.stringify(preview));
    assert.deepEqual(preview.recommendationIds, [input.selection.recommendationId]);
    const applied = await f.call('/api/assurance/apply', applyRequest(input, preview));
    assert.equal(applied.workspace.policies.length, input.workspace.policies.length);
    assert.equal(applied.workspace.policies[0].document.description, input.workspace.policies[0].document.description);
    assert.deepEqual(applied.receipt.recommendationIds, [input.selection.recommendationId]);
    assert.deepEqual((await f.call('/api/state')).workspace, f.state.workspace, 'Apply must not persist the draft');
    const saved = await f.call('/api/workspace', {workspace: applied.workspace, expectedRevision: f.state.revision});
    assert.deepEqual((await f.call('/api/state')).workspace, saved.workspace);
    const project = {...f.project, assurance_reviews: [applied.receipt]};
    const persisted = await f.call('/api/campusweave/project', {project, expectedRevision: project.revision});
    assert.deepEqual((await f.call('/api/campusweave/project?id=' + project.id)).project.assurance_reviews, [
      applied.receipt,
    ]);
    const build = await f.call('/api/build', {});
    assert.match(build.assurance_digest, /^[a-f0-9]{64}$/);
    const review = await f.call('/api/campusweave/review', {
      projectId: project.id,
      expectedRevision: persisted.project.revision,
    });
    assert.equal(review.review.assurance_digest, build.assurance_digest);
    assert.deepEqual(review.review.assurance_reviews, [applied.receipt]);
    const output = await fetch(new URL('/api/output', f.server.url), {
      headers: {'x-rexp-studio-token': f.server.apiToken},
    });
    const archive = Buffer.from(await output.arrayBuffer());
    assert.ok(archive.length > 0);
    const imported = await f.call('/api/import', {
      key: 'synthetic-assurance-test-passphrase',
      dataBase64: archive.toString('base64'),
      expectedRevision: saved.revision,
    });
    assert.equal(imported.workspace.policies[0].document.description, input.workspace.policies[0].document.description);
  } finally {
    await f.close();
  }
});

test('changed draft, result, source digests and workspace revision reject stale applications', async () => {
  const f = await fixture();
  try {
    const input = selectionRequest(f);
    const preview = await reviewedPreview(f, input);
    for (const field of ['draftDigest', 'resultDigest', 'previewDigest', 'assuranceDigest']) {
      await f.call('/api/assurance/apply', {...applyRequest(input, preview), [field]: '0'.repeat(64)}, 409);
    }
    await f.call('/api/assurance/apply', {...applyRequest(input, preview), sourceDigests: {}}, 409);
    const changed = structuredClone(input.workspace);
    changed.policies[0].document.description = 'Changed in a second tab';
    await f.call('/api/workspace', {workspace: changed, expectedRevision: f.state.revision});
    await f.call('/api/assurance/apply', applyRequest(input, preview), 409);
    assert.equal((await f.call('/api/state')).workspace.policies[0].document.description, 'Changed in a second tab');
  } finally {
    await f.close();
  }
});

test('source changes invalidate project assurance bindings while retained snapshots stay inspectable', async () => {
  const f = await fixture();
  try {
    const before = await f.call('/api/campusweave/review', {
      projectId: f.project.id,
      expectedRevision: f.project.revision,
    });
    const previous = f.catalog.snapshotDigest;
    const input = selectionRequest(f);
    const preview = await reviewedPreview(f, input);
    const next = await publishModifiedSnapshot(f, catalog => {
      catalog.recommendations[0].title += ' (changed normalized source fixture)';
    });
    const current = await f.call('/api/assurance/catalog');
    assert.equal(current.snapshotDigest, next);
    await f.call('/api/assurance/apply', applyRequest(input, preview), 409);
    const historicalInput = {...input, snapshotDigest: previous};
    const historical = await reviewedPreview(f, historicalInput);
    assert.equal(historical.ready, true, JSON.stringify(historical));
    const applied = await f.call('/api/assurance/apply', applyRequest(historicalInput, historical));
    assert.equal(applied.preview.snapshotSelection, 'retained');
    const detail = await f.call(
      '/api/assurance/detail?recommendationId=' +
        encodeURIComponent(input.selection.recommendationId) +
        '&snapshotDigest=' +
        previous,
    );
    assert.equal(detail.snapshotDigest, previous);
    assert.equal(detail.detail.id, input.selection.recommendationId);
    const after = await f.call('/api/campusweave/review', {
      projectId: f.project.id,
      expectedRevision: f.project.revision,
    });
    assert.notEqual(after.review.assurance_digest, before.review.assurance_digest);
    assert.equal(after.review.project.compiled_plan, before.review.project.compiled_plan);
    const retained = await f.call('/api/assurance/catalog?snapshotDigest=' + previous);
    assert.equal(retained.snapshotDigest, previous);
    assert.equal((await f.call('/api/assurance/snapshots')).entries.length >= 2, true);
    await writeFile(join(f.dir, artifacts, 'assurance-snapshots/index.json'), '{invalid');
    await f.call('/api/assurance/catalog', undefined, 503);
    const unresolved = await f.call('/api/campusweave/review', {
      projectId: f.project.id,
      expectedRevision: f.project.revision,
    });
    assert.equal(unresolved.review.assurance_digest, null);
  } finally {
    await f.close();
  }
});
