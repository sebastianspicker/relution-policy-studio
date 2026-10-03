import {useEffect, useState} from 'react';
import type {AssuranceRecommendation, AssuranceSource} from 'rexp-studio/browser';
import {request} from './api';
import {Alert, JsonView} from './ui';
import {textValue} from './assurance-model';
export function ValueTable({value}: {value: Record<string, unknown>}) {
  return (
    <dl className="assurance-values">
      {Object.entries(value).map(([key, v]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{textValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
function SourceFacts({source}: {source: AssuranceSource}) {
  return (
    <>
      <h3>{source.title}</h3>
      <dl className="assurance-values">
        <div>
          <dt>Edition</dt>
          <dd>{source.edition}</dd>
        </div>
        <div>
          <dt>Authority / jurisdiction</dt>
          <dd>
            {source.authority} · {source.jurisdiction}
          </dd>
        </div>
        <div>
          <dt>Published / retrieved</dt>
          <dd>
            {source.publicationDate ?? 'Unknown'} / {source.retrievedAt ?? 'Unknown'}
          </dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>
            {source.refresh.freshnessState} · {source.refresh.outcome}
          </dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>{source.lastCheckedAt ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>{source.license}</dd>
        </div>
        <div>
          <dt>Source digest</dt>
          <dd className="identifier">{source.digest}</dd>
        </div>
      </dl>
      <a href={source.url} target="_blank" rel="noreferrer">
        Open source
      </a>
    </>
  );
}
export function RecommendationDetail({
  recommendation: r,
  source,
  sources,
  snapshotDigest,
}: {
  recommendation: AssuranceRecommendation;
  source?: AssuranceSource;
  sources?: readonly AssuranceSource[];
  snapshotDigest: string;
}) {
  const [detail, setDetail] = useState<Record<string, unknown>>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setDetail(undefined);
    setError('');
    void request<{detail: {record: Record<string, unknown>}; snapshotDigest: string}>(
      '/api/assurance/detail?recommendationId=' +
        encodeURIComponent(r.id) +
        '&snapshotDigest=' +
        encodeURIComponent(snapshotDigest),
    )
      .then(value => {
        if (active) {
          if (value.snapshotDigest !== snapshotDigest) throw new Error('Detail snapshot changed. Reload the catalog.');
          setDetail(value.detail.record);
        }
      })
      .catch(e => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [r.id, snapshotDigest, retry]);
  return (
    <>
      <p className="identifier">{r.sourceRecommendationId}</p>
      <p>
        <span className="assurance-badge">{r.disposition}</span> {r.platform} · {r.requirementStrength}
      </p>
      <h3>Rationale</h3>
      <p>{r.rationale ?? 'Not supplied by the source.'}</p>
      <h3>Impact and prerequisites</h3>
      <p>{r.impact ?? 'Impact is not documented. Review before adoption.'}</p>
      <ul>
        {r.prerequisites.map(p => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {r.dispositionReasons.length > 0 && (
        <Alert>
          <ul>
            {r.dispositionReasons.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      <h3>Applicability</h3>
      <ul>
        {r.applicability.predicates.map((p, i) => (
          <li key={i}>
            {p.field} {p.operator}: {textValue(p.value)}
          </li>
        ))}
      </ul>
      <h3>Mapping evidence</h3>
      {r.mapping ? (
        <>
          <p>
            {r.mapping.family} · <span className="identifier">{r.mapping.target}</span>
          </p>
          <ValueTable value={r.mapping.values} />
        </>
      ) : (
        <p>No executable mapping.</p>
      )}
      {r.constraints.length > 0 && (
        <ul>
          {r.constraints.map((p, i) => (
            <li key={i}>
              <code>{p.path}</code> {p.operator}: {textValue(p.value)}
            </li>
          ))}
        </ul>
      )}
      <ul className="identifier">
        {r.provenance.evidence.map(p => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <h3>Source requirement and values</h3>
      {!detail && !error && <p role="status">Loading source detail…</p>}
      {error && (
        <Alert>
          {error}
          <button onClick={() => setRetry(v => v + 1)}>Retry detail</button>
        </Alert>
      )}
      {detail && (
        <>
          <SourceRecord record={detail} />
          <details>
            <summary>Complete source record</summary>
            <JsonView value={detail} />
          </details>
        </>
      )}
      {r.errata.present && (
        <details>
          <summary>Source errata</summary>
          <JsonView value={r.errata.entries} />
        </details>
      )}
      {(sources ?? (source ? [source] : [])).map(s => (
        <details key={s.sourceId}>
          <summary>Source provenance: {s.title}</summary>
          <SourceFacts source={s} />
        </details>
      ))}
    </>
  );
}
function SourceRecord({record}: {record: Record<string, unknown>}) {
  const fields = [
    'requirementText',
    'description',
    'reason',
    'rationale',
    'impact',
    'recommendedValue',
    'defaultValue',
    'audit',
    'remediation',
    'additionalInformation',
    'references',
  ];
  return (
    <div className="assurance-source-text">
      {fields
        .filter(key => record[key] !== undefined && record[key] !== null && record[key] !== '')
        .map(key => (
          <section key={key}>
            <h4>{key.replace(/([A-Z])/g, ' $1')}</h4>
            {Array.isArray(record[key]) ? (
              <ul>
                {(record[key] as unknown[]).map((v, i) => (
                  <li key={i}>{textValue(v)}</li>
                ))}
              </ul>
            ) : (
              <p>{textValue(record[key])}</p>
            )}
          </section>
        ))}
    </div>
  );
}
