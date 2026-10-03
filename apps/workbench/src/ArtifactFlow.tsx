import {useEffect, useState} from 'react';
import type {EditorController, Project, Section} from './types';
import {download, downloadArchive, request} from './api';
import {Stamp} from './ui';
import './save-artifacts.css';

interface ArtifactFlowProps {
  c: EditorController;
  project: Project;
  projectSaved: boolean;
  navigate: (section: Section) => void;
}

interface ReviewItem extends Record<string, unknown> {
  code?: string;
  requirement_id?: string;
  message?: string;
}

interface ReviewEvidence extends Record<string, unknown> {
  requirement_id?: string;
  current?: boolean;
}

interface ReviewPackage extends Record<string, unknown> {
  complete: boolean;
  deployment_authorized: false;
  assurance_digest: string | null;
  assurance_reviews: Record<string, unknown>[];
  mappings: Array<Record<string, unknown> & {current?: boolean; reviewed?: boolean; projectable?: boolean}>;
  unresolved: ReviewItem[];
  evidence: ReviewEvidence[];
  artifact_manifest: Array<Record<string, unknown> & {available?: boolean; artifact?: unknown}>;
  trusted_compilation: Record<string, unknown> | null;
}

interface ReviewResponse {
  review: ReviewPackage;
}

const operationalRequirements = [
  ['target-contract', 'Target contract'],
  ['inventory-scope', 'Inventory-backed scope'],
  ['physical-device', 'Physical-device results'],
  ['recovery', 'Recovery evidence'],
] as const;

const fileName = (path: string) => path.split(/[\\/]/).at(-1) || 'campusweave.rexp';
const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'campusweave';

function Arrow({back = false}: {back?: boolean}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={back ? 'M19 12H5m6 6-6-6 6-6' : 'M5 12h14m-6-6 6 6-6 6'} />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v5h5" />
    </svg>
  );
}

export function ArtifactFlow({c, project, projectSaved, navigate}: ArtifactFlowProps) {
  const [validatedRevision, setValidatedRevision] = useState('');
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [reviewResponse, setReviewResponse] = useState<ReviewResponse>();
  const [reviewStamp, setReviewStamp] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [error, setError] = useState('');

  const validationCurrent = validatedRevision === c.state.revision && !c.isDirty && c.state.validation.ok;
  const currentStamp = `${project.revision}:${c.state.revision}`;
  const reviewCurrent =
    reviewResponse !== undefined && reviewStamp === currentStamp && c.hasFreshBuild && !c.isDirty && projectSaved;
  const review = reviewCurrent ? reviewResponse.review : undefined;
  const packagePrepared = review !== undefined && c.hasFreshBuild;

  useEffect(() => {
    setValidatedRevision('');
    setValidationError('');
  }, [c.state.revision, c.isDirty]);

  useEffect(() => {
    setReviewResponse(undefined);
    setReviewStamp('');
    setError('');
  }, [project.revision, c.state.revision, c.isDirty, c.hasFreshBuild]);

  async function validateSavedWorkspace() {
    if (c.isDirty) return setValidationError('Save policy changes before validating the workspace.');
    if (!projectSaved) return setValidationError('Wait for the project save to finish before validation.');
    const revision = c.state.revision;
    setValidationBusy(true);
    setValidationError('');
    try {
      const result = await request<{validation: {ok: boolean; errors?: Array<{path?: string; message?: string}>}}>(
        '/api/workspace/validate',
        {workspace: c.state.workspace},
      );
      if (!result.validation.ok) {
        const first = result.validation.errors?.[0];
        throw new Error(
          first?.message ? `Workspace validation failed: ${first.message}` : 'Workspace validation failed.',
        );
      }
      setValidatedRevision(revision);
    } catch (reason) {
      setValidatedRevision('');
      setValidationError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setValidationBusy(false);
    }
  }

  async function generateReview() {
    if (!c.hasFreshBuild || c.isDirty)
      return setError('Build a fresh archive from the saved workspace before generating the review.');
    if (!projectSaved) return setError('Wait for the project save to finish before generating the review.');
    const stamp = currentStamp;
    setReviewBusy(true);
    setError('');
    try {
      const result = await request<ReviewResponse>('/api/campusweave/review', {
        projectId: project.id,
        expectedRevision: project.revision,
      });
      setReviewResponse(result);
      setReviewStamp(stamp);
    } catch (reason) {
      setReviewResponse(undefined);
      setReviewStamp('');
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setReviewBusy(false);
    }
  }

  async function getArchive() {
    setError('');
    try {
      await downloadArchive();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const buildDisabled = !validationCurrent || !projectSaved || !c.state.keySet || c.isDirty || c.isBuildLoading;
  const compilationCurrent = review?.trusted_compilation?.valid === true;
  const mappingsCurrent =
    !!review &&
    review.mappings.length > 0 &&
    review.mappings.every(
      mapping => mapping.current === true && mapping.reviewed === true && mapping.projectable === true,
    );
  const sourceRecorded = !!review?.assurance_reviews.length;
  const snapshotBound = review?.assurance_digest !== null && review?.assurance_digest !== undefined;
  const artifactReferencesCurrent =
    review?.artifact_manifest.some(
      entry => entry.available === true && entry.artifact !== null && entry.artifact !== undefined,
    ) === true;
  const reviewedMappingCount = review?.mappings.filter(mapping => mapping.reviewed === true).length ?? 0;
  const unresolvedEvidence = review?.unresolved.filter(item => item.code === 'intent_evidence_missing') ?? [];
  const otherOpenItems =
    review?.unresolved.filter(
      item => item.code !== 'operational_evidence_missing' && item.code !== 'intent_evidence_missing',
    ) ?? [];

  const preparationSteps = (
    <ol className="artifact-steps">
      <li className={validationCurrent ? 'is-complete' : ''}>
        <span className="step-number">01</span>
        <div className="step-copy">
          <h2>Validate workspace</h2>
          <p className="step-status">
            {validationCurrent ? (
              <>
                <i />
                Passed
              </>
            ) : c.isDirty ? (
              'Policy has unsaved changes'
            ) : (
              'Not validated for this revision'
            )}
          </p>
          <p>Check the saved policy against the bundled schema.</p>
          {validationError && (
            <p className="inline-error" role="alert">
              {validationError}
            </p>
          )}
        </div>
        <button disabled={validationBusy || c.isDirty || !projectSaved} onClick={() => void validateSavedWorkspace()}>
          {validationBusy ? 'Validating…' : validationCurrent ? 'Validate again' : 'Validate workspace'}
        </button>
      </li>
      <li className={c.hasFreshBuild ? 'is-complete' : ''}>
        <span className="step-number">02</span>
        <div className="step-copy">
          <h2>Build encrypted archive</h2>
          <p>
            {c.policy ? String(c.policy.document.name ?? c.policy.path) : project.name} ·{' '}
            {c.state.workspace.policies.length} {c.state.workspace.policies.length === 1 ? 'policy' : 'policies'}
          </p>
          <p>
            {c.state.keySet
              ? 'Uses this local session’s configured archive passphrase.'
              : 'An archive passphrase is required in Settings.'}
          </p>
          {!c.state.keySet && (
            <button className="text-action" onClick={() => navigate('Settings')}>
              Open passphrase settings
            </button>
          )}
        </div>
        <button className="primary" disabled={buildDisabled} onClick={() => void c.buildArchive()}>
          {c.isBuildLoading ? 'Building…' : c.hasFreshBuild ? 'Build again' : 'Build archive'}
          <Arrow />
        </button>
      </li>
      <li className={reviewCurrent ? 'is-complete' : ''}>
        <span className="step-number">03</span>
        <div className="step-copy">
          <h2>Generate review</h2>
          <p>Profile, mappings, source acknowledgment, artifact references and unresolved evidence.</p>
          <p>
            {!c.hasFreshBuild
              ? 'Build the archive first.'
              : reviewCurrent
                ? review?.complete
                  ? 'Review package is complete.'
                  : 'Review package generated with open requirements.'
                : 'Ready after the fresh build.'}
          </p>
        </div>
        <button
          disabled={!c.hasFreshBuild || c.isDirty || !projectSaved || reviewBusy}
          onClick={() => void generateReview()}
        >
          {reviewBusy ? 'Generating…' : reviewCurrent ? 'Generate again' : 'Generate review'}
        </button>
      </li>
    </ol>
  );

  return (
    <div className="save-artifacts-screen artifact-flow-screen">
      <div className="worksheet-grid">
        <section className="save-artifacts-main" aria-labelledby="artifact-flow-heading">
          <header className="worksheet-heading">
            <h1 id="artifact-flow-heading">{packagePrepared ? 'Local package prepared' : 'Prepare artifacts'}</h1>
            <p>
              {packagePrepared
                ? 'Archive built and locally validated.'
                : 'Validate the saved policy, then build the local archive.'}
            </p>
          </header>

          {!packagePrepared && preparationSteps}

          {packagePrepared && (
            <section className="artifact-downloads" aria-labelledby="downloads-heading">
              <h2 id="downloads-heading">Prepared files</h2>
              <div className="download-row">
                <FileIcon />
                <span>
                  <strong>{fileName(c.state.outputFile)}</strong>
                  <small>Encrypted policy archive</small>
                </span>
                <button className="primary" onClick={() => void getArchive()}>
                  Download archive
                  <Arrow />
                </button>
              </div>
              <div className="download-row">
                <FileIcon />
                <span>
                  <strong>{slug(project.name)}-review.json</strong>
                  <small>Profile, mappings, source review, artifact manifest and open requirements</small>
                </span>
                <button onClick={() => download(reviewResponse, `${slug(project.name)}-review.json`)}>
                  Download review
                </button>
              </div>
              <h3>Included</h3>
              <table className="included-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Intent and scope</td>
                    <td>{compilationCurrent ? 'Included' : 'Missing'}</td>
                  </tr>
                  <tr>
                    <td>
                      {reviewedMappingCount} reviewed {reviewedMappingCount === 1 ? 'mapping' : 'mappings'}
                    </td>
                    <td>{mappingsCurrent ? 'Current' : 'Review required'}</td>
                  </tr>
                  <tr>
                    <td>Source acknowledgment</td>
                    <td>{sourceRecorded ? 'Recorded' : 'Missing'}</td>
                  </tr>
                  <tr>
                    <td>Artifact references</td>
                    <td>{artifactReferencesCurrent ? 'Included' : 'Missing'}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}
          {packagePrepared && (
            <details className="preparation-details">
              <summary>Preparation details</summary>
              {preparationSteps}
            </details>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {review && unresolvedEvidence.length > 0 && (
            <details className="open-review-items">
              <summary>
                {unresolvedEvidence.length} unresolved evidence{' '}
                {unresolvedEvidence.length === 1 ? 'requirement' : 'requirements'}
              </summary>
              <ul>
                {unresolvedEvidence.map((item, index) => (
                  <li key={`${String(item.requirement_id)}-${String(index)}`}>
                    <code>{item.requirement_id ?? 'unresolved'}</code>
                    <span>{item.message ?? 'Evidence requirement remains unresolved'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {review && otherOpenItems.length > 0 && (
            <details className="open-review-items">
              <summary>
                {otherOpenItems.length} other unresolved review {otherOpenItems.length === 1 ? 'item' : 'items'}
              </summary>
              <ul>
                {otherOpenItems.map((item, index) => (
                  <li key={`${String(item.code)}-${String(index)}`}>
                    <code>{item.code ?? 'unresolved'}</code>
                    <span>{item.message ?? 'Review item remains unresolved'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <aside className="context-panel artifact-context" aria-labelledby="prerequisites-heading">
          <h2 id="prerequisites-heading">{packagePrepared ? 'Operational review is open' : 'Local prerequisites'}</h2>
          <dl className="facts">
            <div>
              <dt>Profile compilation</dt>
              <dd>
                {review ? (
                  compilationCurrent ? (
                    <Stamp tone="ok">Current</Stamp>
                  ) : (
                    <Stamp tone="caution">Needs review</Stamp>
                  )
                ) : (
                  <Stamp>Pending review</Stamp>
                )}
              </dd>
            </div>
            <div>
              <dt>Policy save</dt>
              <dd>{c.isDirty ? <Stamp tone="caution">Unsaved</Stamp> : <Stamp tone="ok">Saved</Stamp>}</dd>
            </div>
            <div>
              <dt>Intent mappings</dt>
              <dd>
                {review ? (
                  mappingsCurrent ? (
                    <Stamp tone="ok">Reviewed</Stamp>
                  ) : (
                    <Stamp tone="caution">Needs review</Stamp>
                  )
                ) : (
                  <Stamp>Pending review</Stamp>
                )}
              </dd>
            </div>
            <div>
              <dt>Source acknowledgment</dt>
              <dd>
                {review ? (
                  sourceRecorded ? (
                    <Stamp tone="ok">Recorded</Stamp>
                  ) : (
                    <Stamp tone="caution">Missing</Stamp>
                  )
                ) : (
                  <Stamp>Pending review</Stamp>
                )}
              </dd>
            </div>
          </dl>
          {review && (
            <div className="source-freshness">
              <span aria-hidden="true">!</span>
              <div>
                <strong>{snapshotBound ? 'Bound to installed snapshot' : 'Snapshot binding unavailable'}</strong>
                <small>Source freshness remains unverified</small>
              </div>
            </div>
          )}
          <h3>External evidence</h3>
          <dl className="facts operational-facts">
            {operationalRequirements.map(([id, label]) => {
              const current = review?.evidence.some(entry => entry.requirement_id === id && entry.current === true);
              return (
                <div key={id}>
                  <dt>{label}</dt>
                  <dd>
                    {review ? (
                      current ? (
                        <Stamp tone="ok">Referenced</Stamp>
                      ) : (
                        <Stamp tone="caution">Missing</Stamp>
                      )
                    ) : (
                      <Stamp>Pending review</Stamp>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <button className="text-action" onClick={() => navigate('Evidence')}>
            Attach or review evidence
            <Arrow />
          </button>
          {review?.complete === false && (
            <button className="text-action" onClick={() => navigate('Review')}>
              Open full review and export
              <Arrow />
            </button>
          )}
          <p>Local preparation does not authorize deployment. External evidence requires human review.</p>
        </aside>
      </div>

      <footer className={`worksheet-footer ${packagePrepared ? 'completion-footer' : ''}`}>
        {packagePrepared ? (
          <>
            <span className="completion-message">
              <Stamp tone="ok">Locally validated</Stamp>
              <span>
                Archive built and checked on this machine. Not operationally verified; deployment is not authorized.
              </span>
            </span>
            <button onClick={() => navigate('Scope')}>
              <Arrow back />
              Return to project
            </button>
          </>
        ) : (
          <>
            <button className="back-action" onClick={() => navigate('Save & map' as Section)}>
              <Arrow back />
              Back to save &amp; map
            </button>
            <span>{projectSaved ? 'Policy and mappings saved locally' : 'Waiting for the project save to finish'}</span>
          </>
        )}
      </footer>
    </div>
  );
}
