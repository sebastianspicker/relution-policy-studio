import {useEffect, useState} from 'react';
import type {
  AssuranceCatalogBundle,
  AssuranceCatalogLoadResult,
  AssuranceSnapshotIndex,
  AssuranceApplicabilityContext,
} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {Alert, Field} from './ui';
import {download, request} from './api';
import {AssuranceCatalog} from './AssuranceCatalog';
import {AssuranceCompliance} from './AssuranceCompliance';
import {AssuranceCompatibility} from './AssuranceCompatibility';
import './assurance.css';
export function Assurance({
  tab,
  c,
  project,
  update,
}: {
  tab: string;
  c: EditorController;
  project?: Project;
  update: (fn: (p: Project) => Project) => void;
}) {
  const [bundle, setBundle] = useState<AssuranceCatalogBundle>();
  const [snapshots, setSnapshots] = useState<AssuranceSnapshotIndex>();
  const [snapshot, setSnapshot] = useState('');
  const [context, setContext] = useState<AssuranceApplicabilityContext>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setBundle(undefined);
    void Promise.all([
      request<AssuranceCatalogLoadResult>(
        '/api/assurance/catalog' + (snapshot ? '?snapshotDigest=' + encodeURIComponent(snapshot) : ''),
      ),
      request<AssuranceSnapshotIndex>('/api/assurance/snapshots'),
    ])
      .then(([catalog, index]) => {
        if (!active) return;
        if (catalog.status !== 'available') throw new Error(catalog.error);
        setBundle(catalog);
        setSnapshots(index);
      })
      .catch(e => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot, retry]);
  return (
    <div className="assurance">
      <div className="assurance-context">
        <Field label="Source snapshot">
          <select value={snapshot} onChange={e => setSnapshot(e.target.value)}>
            <option value="">Installed snapshot (currency unverified)</option>
            {snapshots?.entries.map(s => (
              <option key={s.snapshotDigest} value={s.snapshotDigest}>
                Retained · {s.sourceCheckedAt || 'date unknown'} · {s.snapshotDigest.slice(0, 10)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target policy">
          <select
            value={c.selection?.policyIndex ?? ''}
            onChange={e => c.setSelection({policyIndex: Number(e.target.value), versionIndex: 0})}
          >
            <option value="" disabled>
              Select policy
            </option>
            {c.state.workspace.policies.map((p, i) => (
              <option key={p.path} value={i}>
                {String(p.document.name ?? p.path)}
              </option>
            ))}
          </select>
        </Field>
        <details>
          <summary>Device applicability context</summary>
          <p className="muted">Context is a reviewed assumption for this selection, not a live device assessment.</p>
          {(['osVersion', 'enrollmentChannel', 'deviceOwnership', 'supervision'] as const).map(key => (
            <Field
              key={key}
              label={
                {
                  osVersion: 'OS version',
                  enrollmentChannel: 'Enrollment channel',
                  deviceOwnership: 'Device ownership',
                  supervision: 'Supervision',
                }[key]
              }
            >
              <input
                value={context[key] ?? ''}
                onChange={e => setContext(current => ({...current, [key]: e.target.value || undefined}))}
              />
            </Field>
          ))}
        </details>
      </div>
      {snapshot && (
        <Alert>
          A retained snapshot is selected. Review its provenance and acknowledge its source digests before applying.
        </Alert>
      )}
      {bundle && (
        <p className="assurance-currency">
          {bundle.catalog.freshnessClaim === 'none' ? 'Source currency is unverified' : bundle.catalog.freshnessClaim} ·
          last source check {bundle.catalog.sourceCheckedAt ?? 'unknown'} · snapshot{' '}
          <span className="identifier">{bundle.snapshotDigest.slice(0, 16)}</span>
        </p>
      )}
      {loading && (
        <p className="assurance-count" role="status">
          Loading assurance sources and snapshots…
        </p>
      )}
      {error && (
        <Alert>
          {error}
          <button onClick={() => setRetry(v => v + 1)}>Retry assurance catalog</button>
        </Alert>
      )}
      {bundle &&
        !loading &&
        (tab === 'Compliance' ? (
          <AssuranceCompliance
            key={bundle.snapshotDigest}
            c={c}
            project={project}
            update={update}
            bundle={bundle}
            snapshot={snapshot}
            context={context}
          />
        ) : (
          <AssuranceCatalog
            key={tab + bundle.snapshotDigest}
            tab={tab}
            c={c}
            project={project}
            update={update}
            bundle={bundle}
            snapshot={snapshot}
            context={context}
          />
        ))}
      {tab !== 'Compliance' && <AssuranceCompatibility key={tab} tab={tab} c={c} />}
      <div className="assurance-savebar">
        <span>{c.isDirty ? 'Policy draft has unsaved changes.' : 'Policy workspace is saved.'}</span>
        <button className="primary" disabled={!c.isDirty} onClick={() => void c.saveWorkspace()}>
          Save changes
        </button>
        {c.isDirty && (
          <button onClick={() => download(c.state.workspace, 'campusweave-policy-draft.json')}>
            Export unsaved policy draft
          </button>
        )}
        <button disabled={!c.canUndo} onClick={c.undoWorkspace}>
          Undo
        </button>
        {!!project?.assurance_reviews?.length && (
          <button onClick={() => download(project.assurance_reviews, 'campusweave-assurance-reviews.json')}>
            Export review receipts
          </button>
        )}
      </div>
    </div>
  );
}
