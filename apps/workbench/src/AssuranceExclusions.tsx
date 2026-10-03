import {useState} from 'react';
import type {AssuranceSelectionExclusion} from 'rexp-studio/browser';
import {Field} from './ui';
export function AssuranceExclusions({
  entries,
  label = 'Exclusions',
}: {
  entries: readonly AssuranceSelectionExclusion[];
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = entries.filter(e =>
    (e.recommendationId + ' ' + e.reason).toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages - 1);
  return (
    <details>
      <summary>
        {label} ({entries.length})
      </summary>
      <Field label={'Search ' + label.toLowerCase()}>
        <input
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </Field>
      <p className="muted" role="status">
        {filtered.length} matches · page {current + 1} of {pages}
      </p>
      <ul>
        {filtered.slice(current * 20, (current + 1) * 20).map((e, i) => (
          <li key={e.recommendationId + i}>
            <span className="identifier">{e.recommendationId}</span>
            <br />
            {e.reason}
          </li>
        ))}
      </ul>
      {!filtered.length && <p>No matching exclusions.</p>}
      <div className="inline-actions">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          Previous exclusions
        </button>
        <button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
          Next exclusions
        </button>
      </div>
    </details>
  );
}
