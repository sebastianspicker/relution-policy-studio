import {useEffect, useState} from 'react';
import type {CampusWeaveEvidence} from 'rexp-studio/browser';
import type {EditorController, Project, Section} from './types';
import {Alert, Empty, Field, Icon, JsonView, Stamp} from './ui';
import {digest, download, request} from './api';
const evidenceKinds: readonly CampusWeaveEvidence['kind'][] = ['local', 'target', 'device', 'recovery'];
export function Evidence({
  project,
  update,
  c,
}: {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  c: EditorController;
}) {
  const [intent, setIntent] = useState('');
  const [requirement, setRequirement] = useState('');
  const [kind, setKind] = useState<CampusWeaveEvidence['kind']>('local');
  const [file, setFile] = useState<File>();
  const [artifact, setArtifact] = useState<File>();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState<Map<string, {current: boolean; assurance_currency?: string}>>(new Map());
  useEffect(() => {
    let active = true;
    setCurrency(new Map());
    void request<{review: {evidence: Array<{id: string; current: boolean; assurance_currency?: string}>}}>(
      '/api/campusweave/review',
      {projectId: project.id, expectedRevision: project.revision},
    )
      .then(result => {
        if (active) setCurrency(new Map(result.review.evidence.map(e => [e.id, e])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [project, c.state.revision]);
  async function attach() {
    try {
      if (!file || !artifact || !intent || !requirement.trim())
        throw new Error('Select intent, requirement, evidence and related artifact files.');
      if (c.isDirty) throw new Error('Save policy changes and build the related artifact before attaching evidence.');
      const currentReview = await request<{review: {assurance_digest: string | null}}>('/api/campusweave/review', {
        projectId: project.id,
        expectedRevision: project.revision,
      });
      if (!currentReview.review.assurance_digest)
        throw new Error('Assurance sources are unavailable; evidence cannot be bound to the current recommendations.');
      const workspaceId = c.state.active_workspace_id;
      if (!workspaceId) throw new Error('Create or link this policy workspace in Workspaces first.');
      const sha = async (f: File) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))]
          .map(x => x.toString(16).padStart(2, '0'))
          .join('');
      const record: CampusWeaveEvidence = {
        id: crypto.randomUUID(),
        name: file.name,
        intent_id: intent,
        requirement_id: requirement,
        kind,
        file_name: file.name,
        evidence_digest: await sha(file),
        artifact_digest: await sha(artifact),
        artifact_name: artifact?.name ?? null,
        profile_digest: await digest(project.profile),
        policy_revision: c.state.revision,
        catalog_digest: String(
          c.state.campusweave_catalog_digest ?? project.compiled_plan?.catalog_digest ?? (await digest(c.state.bundle)),
        ),
        assurance_digest: currentReview.review.assurance_digest,
        workspace_id: workspaceId,
        note,
        recorded_at: new Date().toISOString(),
      };
      update(p => ({...p, evidence: [...p.evidence, record]}));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="split">
      <section className="table-pane">
        <div className="page-body">
          <h2>Evidence index</h2>
          <p>
            Associate source artifacts with requirements. Local validation, target checks and physical-device results
            are distinct evidence classes.
          </p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Evidence</th>
              <th>Type</th>
              <th>Freshness</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.evidence.map((e, index) => {
              const id = typeof e.id === 'string' ? e.id : undefined;
              const state = id === undefined ? undefined : currency.get(id);
              return (
                <tr key={id ?? index}>
                  <td>{typeof e.name === 'string' ? e.name : id}</td>
                  <td>{String(e.kind)}</td>
                  <td>
                    {state?.assurance_currency === 'unknown' ? (
                      <Stamp tone="caution">Currency unknown</Stamp>
                    ) : state?.current === false ? (
                      <Stamp tone="caution">Stale or unresolved</Stamp>
                    ) : state?.current === true ? (
                      <>
                        <Stamp tone="ok">Current reference</Stamp> <span className="muted">Review its claims</span>
                      </>
                    ) : (
                      <Stamp>Checking saved reference</Stamp>
                    )}
                  </td>
                  <td>
                    <button onClick={() => download(e, 'evidence-reference.json')}>Export reference</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!project.evidence.length && (
          <Empty title="No evidence attached">Missing evidence remains visible in the review package.</Empty>
        )}
      </section>
      <aside className="inspector">
        <h2>Attach evidence</h2>
        <Field label="Intent">
          <select value={intent} onChange={e => setIntent(e.target.value)}>
            <option value="">Select intent</option>
            {project.profile.intents.map(i => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Requirement">
          <input list="evidence-requirements" value={requirement} onChange={e => setRequirement(e.target.value)} />
          <datalist id="evidence-requirements">
            {[
              ...(project.profile.intents.find(i => i.id === intent)?.requirements ?? []),
              'target-contract',
              'inventory-scope',
              'physical-device',
              'recovery',
            ]
              .filter((v): v is string => typeof v === 'string')
              .map(v => (
                <option key={v} value={v} />
              ))}
          </datalist>
        </Field>
        <Field label="Evidence class">
          <select
            value={kind}
            onChange={e => {
              const next = evidenceKinds.find(k => k === e.target.value);
              if (next) setKind(next);
            }}
          >
            <option value="local">Local check</option>
            <option value="target">Target result</option>
            <option value="device">Physical-device result</option>
            <option value="recovery">Recovery evidence</option>
          </select>
        </Field>
        <Field label="Evidence source file">
          <input type="file" onChange={e => setFile(e.target.files?.[0])} />
        </Field>
        <Field label="Related artifact file">
          <input type="file" onChange={e => setArtifact(e.target.files?.[0])} />
        </Field>
        <Field label="Source and applicability notes">
          <textarea value={note} onChange={e => setNote(e.target.value)} />
        </Field>
        <p className="muted">
          The index stores file hashes and provenance. Keep the original files for review. Attaching a file does not
          verify its claims.
        </p>
        <button
          className="primary"
          disabled={c.isDirty || !file || !artifact || !intent || !requirement.trim()}
          onClick={() => void attach()}
        >
          Attach evidence
        </button>
        {error && <Alert>{error}</Alert>}
      </aside>
    </div>
  );
}
export function Review({project, navigate, saved}: {project: Project; saved: boolean; navigate: (s: Section) => void}) {
  const [error, setError] = useState('');
  const [report, setReport] = useState<unknown>();
  useEffect(() => {
    setReport(undefined);
    setError('');
    if (!saved) return;
    let active = true;
    void request('/api/campusweave/review', {projectId: project.id, expectedRevision: project.revision})
      .then(r => {
        if (active) setReport(r);
      })
      .catch(e => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [project.id, project.revision, saved]);
  const reviewed =
    report && typeof report === 'object'
      ? 'review' in report
        ? (
            report as {
              review: {
                complete?: boolean;
                unresolved?: unknown[];
                evidence?: Array<{id: string; intent_id?: string; current: boolean}>;
                mappings?: Array<{id: string; intent_id?: string; projectable: boolean}>;
              };
            }
          ).review
        : undefined
      : undefined;
  async function exportReview() {
    try {
      const r = await request('/api/campusweave/review', {projectId: project.id, expectedRevision: project.revision});
      setReport(r);
      download(r, 'campusweave-review.json');
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <div className="section-action">
        <button className="primary" disabled={!saved} onClick={() => void exportReview()}>
          Export review package
        </button>
      </div>
      <div className="review-layout">
        <section>
          <Alert>
            {reviewed?.complete === true
              ? 'Review references are current · deployment remains unauthorized'
              : 'Review incomplete · verify target, device and recovery evidence before any operational decision'}
          </Alert>
          <h2>Policy outcomes</h2>
          <table>
            <thead>
              <tr>
                <th>Intent</th>
                <th>Local artifact</th>
                <th>Evidence</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {project.profile.intents.map(i => {
                const e = project.evidence.find(e => e.intent_id === i.id);
                return (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{e?.artifact_name ? <code>{String(e.artifact_name)}</code> : <Stamp>No artifact</Stamp>}</td>
                    <td>
                      {!e ? (
                        <Stamp>Not assessed</Stamp>
                      ) : reviewed?.evidence?.some(item => item.intent_id === i.id && item.current) ? (
                        <Stamp tone="ok">Current reference</Stamp>
                      ) : (
                        <Stamp tone="caution">Stale or unresolved</Stamp>
                      )}
                    </td>
                    <td>
                      {!project.mappings.some(m => m.intent_id === i.id) ? (
                        <Stamp>Needs mapping</Stamp>
                      ) : reviewed?.mappings?.filter(m => m.intent_id === i.id).every(m => m.projectable) ? (
                        <Stamp tone="ok">Mapping current</Stamp>
                      ) : (
                        <Stamp tone="caution">Needs review</Stamp>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h2>Package contents</h2>
          <div className="package-rows">
            {[
              ['Profile', 'Institution, organizational units and environment summary', project.profile],
              ['Offline intent plan', 'All intents with scopes and policy mappings', project.compiled_plan],
              [
                'Artifact manifest',
                'Local artifacts referenced in this package',
                project.evidence.map(e => ({name: e.artifact_name, digest: e.artifact_digest})),
              ],
              ['Evidence index', 'Evidence items linked to intents and requirements', project.evidence],
              [
                'Assurance reviews',
                'Reviewed selections, source conflicts, exclusions and external obligations',
                project.assurance_reviews ?? [],
              ],
            ].map(([name, desc, value]) => (
              <button
                key={String(name)}
                onClick={() => download(value, String(name).toLowerCase().replaceAll(' ', '-') + '.json')}
              >
                <Icon name="Evidence" />
                <strong>{String(name)}</strong>
                <span>{String(desc)}</span>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
          <p className="review-note">
            <Icon name="info" />
            Export preserves unresolved requirements. It does not authorize deployment.
          </p>
          {error && <Alert>{error}</Alert>}
          {report !== undefined && (
            <details>
              <summary>Exported review</summary>
              <JsonView value={report} />
            </details>
          )}
        </section>
        <aside className="inspector">
          <h2>Open requirements</h2>
          {reviewed?.unresolved ? (
            <ul>
              {reviewed.unresolved.map((item, i) => (
                <li key={i}>
                  {typeof item === 'object' && item !== null
                    ? String(
                        (item as Record<string, unknown>).message ??
                          (item as Record<string, unknown>).name ??
                          (item as Record<string, unknown>).code ??
                          'Unresolved requirement',
                      )
                    : String(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Loading current review requirements…</p>
          )}
          <p>
            Local validation checks local artifacts only. Evidence freshness is bound to the profile, workspace
            revision, artifact, reference catalog and assurance digest. Legacy evidence without an assurance binding has
            unknown currency.
          </p>
          {project.profile.unresolved.length > 0 && (
            <details>
              <summary>{project.profile.unresolved.length} unresolved planning records</summary>
              <JsonView value={project.profile.unresolved} />
            </details>
          )}
          <h3>Next action</h3>
          <button className="primary wide" onClick={() => navigate('Evidence')}>
            Attach evidence
          </button>
        </aside>
      </div>
    </>
  );
}
