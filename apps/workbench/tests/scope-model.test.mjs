import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorkbenchModules} from './support/vite-loader.mjs';
// Load the browser's pure model through Vite so relative and bare imports resolve.
const [{applyScopeDraft, scopeDraft}, {blankProfile}] = await loadWorkbenchModules(
  '/src/scope-model.ts',
  '/src/types.ts',
);
function fixture() {
  const profile = blankProfile('Campus IT');
  const first = applyScopeDraft(profile, {
    intentId: 'intent',
    name: 'Protect staff devices',
    outcome: 'Require passcodes',
    organization: 'Campus IT',
    location: 'Cologne',
    cohort: 'Staff',
    ownership: 'institution',
    platform: 'ios_ipados',
    scope: 'Managed staff',
    stage: 'Pilot',
    role: 'staff',
    layer: 1,
  });
  return {id: 'project', profile: first};
}
test('unfinished draft preserves existing references, requirements and stage', () => {
  const project = fixture();
  project.profile.intents[0].requirements = [{id: 'human-review', kind: 'evidence'}];
  const before = structuredClone(project.profile);
  const next = applyScopeDraft(project.profile, {
    ...scopeDraft(project),
    cohort: '',
    scope: '',
    stage: '',
    outcome: 'Draft outcome',
  });
  assert.deepEqual(next.intents[0].cohort_ids, before.intents[0].cohort_ids);
  assert.deepEqual(next.intents[0].scope_ids, before.intents[0].scope_ids);
  assert.deepEqual(next.intents[0].requirements, before.intents[0].requirements);
  assert.deepEqual(next.assignments, before.assignments);
  assert.deepEqual(project.profile, before);
});
test('selecting an existing secondary scope keeps both assignments without duplicates', () => {
  const project = fixture(),
    p = project.profile;
  const second = {...structuredClone(p.scope_blueprints[0]), id: 'second', name: 'Second scope'};
  p.scope_blueprints.push(second);
  p.intents[0].scope_ids.push('second');
  p.assignments.push({...p.assignments[0], id: 'second-assignment', scope_id: 'second'});
  const next = applyScopeDraft(p, {...scopeDraft(project), scope: 'Second scope'});
  assert.equal(next.assignments.length, 2);
  assert.equal(new Set(next.assignments.map(row => row.scope_id)).size, 2);
  assert.deepEqual(new Set(next.intents[0].scope_ids), new Set(p.intents[0].scope_ids));
});
test('duplicate names retain the linked record and reject an ambiguous new choice', () => {
  const project = fixture(),
    p = project.profile;
  p.cohorts.unshift({...p.cohorts[0], id: 'another'});
  const next = applyScopeDraft(p, scopeDraft(project));
  assert.equal(next.intents[0].cohort_ids[0], p.intents[0].cohort_ids[0]);
  p.cohorts.push({id: 'x', name: 'Ambiguous'}, {id: 'y', name: 'Ambiguous'});
  assert.throws(() => applyScopeDraft(p, {...scopeDraft(project), cohort: 'Ambiguous'}), /More than one/);
});
test('editing one intent preserves unrelated records and shared scope constraints', () => {
  const project = fixture(),
    p = project.profile;
  p.intents.push({...structuredClone(p.intents[0]), id: 'other', name: 'Other task'});
  const next = applyScopeDraft(p, {...scopeDraft(project), platform: 'macos', name: 'Updated'});
  assert.deepEqual(next.scope_blueprints, p.scope_blueprints);
  assert.deepEqual(next.intents[1], p.intents[1]);
  assert.equal(next.intents[0].platform, 'macos');
});
test('scope draft derives its own stage regardless of assignment order', () => {
  const project = fixture(),
    p = project.profile;
  const originalAssignment = structuredClone(p.assignments[0]);
  p.scope_blueprints.push({...p.scope_blueprints[0], id: 'secondary-scope', name: 'Secondary'});
  p.rollout_stages.push({id: 'later', name: 'Later stage'});
  p.intents[0].scope_ids.push('secondary-scope');
  p.assignments.unshift({
    ...p.assignments[0],
    id: 'secondary-assignment',
    scope_id: 'secondary-scope',
    rollout_stage_id: 'later',
  });
  const draft = scopeDraft(project);
  assert.equal(draft.stage, 'Pilot');
  const next = applyScopeDraft(p, {...draft, outcome: 'Revised outcome'});
  assert.deepEqual(
    next.assignments.find(row => row.id === originalAssignment.id),
    originalAssignment,
  );
});
