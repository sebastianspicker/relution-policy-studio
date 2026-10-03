import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {reviewCampusWeaveProject} from 'rexp-studio/testing';
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
const hash = v =>
  createHash('sha256')
    .update(canonical(v) + '\n')
    .digest('hex');
function fixture() {
  const profile = {
    schema_version: 2,
    id: 'test',
    name: 'Synthetic',
    organizations: [],
    locations: [],
    cohorts: [],
    intents: [{id: 'intent', name: 'Intent', requirements: ['local-check']}],
    scope_blueprints: [],
    assignments: [],
    rollout_stages: [],
    unresolved: [],
  };
  const plan = {steps: [{id: 'intent'}], execution_authorized: false};
  const compiled = {
    profile_digest: hash(profile),
    valid: true,
    plan,
    plan_digest: hash(plan),
    catalog_digest: hash('catalog'),
  };
  const mappings = ['workspace-a', 'workspace-b'].map(workspace_id => ({
    id: workspace_id,
    intent_id: 'intent',
    workspace_id,
    policy_id: 'policy',
    configuration_id: 'config',
    field: 'field',
    value: true,
    platform: 'IOS',
    configuration_type: 'TYPE',
    applicability: 'Synthetic',
    reviewed: true,
    profile_digest: compiled.profile_digest,
    policy_revision: workspace_id,
  }));
  const workspaces = new Map(
    mappings.map(m => [
      m.workspace_id,
      {
        available: true,
        policyRevision: m.policy_revision,
        artifact: {
          policyRevision: m.policy_revision,
          artifactDigest: hash(m.workspace_id),
          catalogDigest: compiled.catalog_digest,
          assuranceDigest: hash('assurance'),
        },
      },
    ]),
  );
  const evidence = mappings.flatMap(m =>
    ['local-check', 'target-contract', 'inventory-scope', 'physical-device', 'recovery'].map(requirement_id => ({
      id: m.id + requirement_id,
      intent_id: 'intent',
      workspace_id: m.workspace_id,
      requirement_id,
      kind:
        requirement_id === 'physical-device'
          ? 'device'
          : requirement_id === 'recovery'
            ? 'recovery'
            : requirement_id === 'local-check'
              ? 'local'
              : 'target',
      profile_digest: compiled.profile_digest,
      policy_revision: m.policy_revision,
      artifact_digest: hash(m.workspace_id),
      catalog_digest: compiled.catalog_digest,
      assurance_digest: hash('assurance'),
    })),
  );
  const project = {
    schema_version: 1,
    id: 'project',
    name: 'Synthetic',
    revision: 1,
    profile,
    compiled_plan: compiled,
    mappings,
    workspace_refs: mappings.map(m => ({
      id: m.workspace_id,
      name: m.workspace_id,
      platform: 'IOS',
      created_at: 'synthetic',
    })),
    evidence,
    operations: [],
  };
  return {
    project,
    current: {
      assuranceDigest: hash('assurance'),
      catalogDigest: compiled.catalog_digest,
      workspaces,
      trustedCompilation: compiled,
    },
  };
}

test('multiple current workspace artifacts survive review without implying operational authority', () => {
  const {project, current} = fixture();
  const result = reviewCampusWeaveProject(project, current);
  assert.equal(result.complete, true);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.deployment_authorized, false);
  assert.equal(result.artifact_manifest.length, 2);
  assert.deepEqual(result.project, project);
});
test('missing workspaces fail closed and unrelated evidence cannot satisfy another intent', () => {
  const {project, current} = fixture();
  current.workspaces.delete('workspace-a');
  let result = reviewCampusWeaveProject(project, current);
  assert.equal(result.mappings[0].projectable, false);
  assert.equal(result.complete, false);
  const fresh = fixture();
  fresh.project.evidence = fresh.project.evidence.map(e => ({...e, intent_id: 'unrelated'}));
  result = reviewCampusWeaveProject(fresh.project, fresh.current);
  assert.equal(result.complete, false);
  assert.ok(result.unresolved.some(e => e.code === 'intent_evidence_missing'));
});
test('forged, stale and invalid compiler results never become projectable', () => {
  for (const change of [
    p => {
      p.compiled_plan.plan = {steps: [], execution_authorized: true};
      p.compiled_plan.plan_digest = hash(p.compiled_plan.plan);
    },
    p => {
      p.profile.name = 'Edited';
    },
    p => {
      p.compiled_plan.valid = false;
    },
  ]) {
    const {project, current} = fixture();
    current.trustedCompilation = structuredClone(current.trustedCompilation);
    change(project);
    const result = reviewCampusWeaveProject(project, current);
    assert.equal(result.complete, false);
    assert.ok(result.mappings.every(m => !m.projectable));
  }
});
test('profile mutations invalidate previously current evidence', () => {
  const {project, current} = fixture();
  project.profile.name = 'Changed after evidence';
  const result = reviewCampusWeaveProject(project, current);
  assert.ok(result.evidence.every(e => e.current === false));
  assert.equal(result.complete, false);
});

test('recommendation or decision changes invalidate assurance independently of the configuration catalog', () => {
  const {project, current} = fixture();
  const before = reviewCampusWeaveProject(project, current);
  assert.ok(before.evidence.every(e => e.assurance_currency === 'current'));
  current.assuranceDigest = hash('changed recommendation content or recorded decisions');
  const after = reviewCampusWeaveProject(project, current);
  assert.equal(after.complete, false);
  assert.ok(after.evidence.every(e => e.current === false && e.assurance_currency === 'stale'));
  assert.ok(after.evidence.every(e => e.reasons.includes('Evidence assurance digest is stale')));
  assert.equal(after.project.compiled_plan.catalog_digest, current.catalogDigest);
});

test('legacy evidence remains readable with unknown assurance currency and explicit external obligations', () => {
  const {project, current} = fixture();
  for (const entry of project.evidence) delete entry.assurance_digest;
  project.assurance_reviews = [
    {
      selection: {kind: 'preset', presetId: 'managed'},
      exclusions: [{reason: 'Institutional recovery process needs evidence'}],
      exceptions: [{reason: 'Documented local exception', requirement_id: 'local-check'}],
    },
  ];
  const result = reviewCampusWeaveProject(project, current);
  assert.equal(result.complete, false);
  assert.ok(result.evidence.every(e => e.assurance_currency === 'unknown' && e.current === false));
  assert.deepEqual(result.assurance_reviews, project.assurance_reviews);
  assert.equal(result.assurance_digest, current.assuranceDigest);
});
