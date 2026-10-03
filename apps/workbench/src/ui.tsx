import {Children, cloneElement, isValidElement, useId, useState, type ReactNode, type ReactElement} from 'react';
export function Icon({name, size = 22}: {name: string; size?: number}) {
  const paths: Record<string, ReactNode> = {
    Overview: (
      <>
        <path d="m3 10 9-8 9 8v11h-6v-7H9v7H3z" />
      </>
    ),
    Institution: (
      <>
        <path d="m2 7 10-5 10 5H2zm2 3v9m5-9v9m6-9v9m5-9v9M2 22h20M2 19h20" />
      </>
    ),
    Intent: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    Policies: (
      <>
        <path d="M14 2H4v20h12M14 2v6h6l-6-6zM7 11h5M7 15h3" />
        <path d="m17 13 5 2v3c0 3-5 5-5 5s-5-2-5-5v-3z" />
      </>
    ),
    Evidence: (
      <>
        <rect x="3" y="9" width="3" height="12" />
        <rect x="10" y="3" width="3" height="18" />
        <rect x="17" y="12" width="3" height="9" />
      </>
    ),
    Review: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m6 12 4 4 8-9" />
      </>
    ),
    Archives: (
      <>
        <path d="M4 7v14h16V7M2 3h20v4H2zM9 11h6" />
      </>
    ),
    'Device assessment': (
      <>
        <rect x="4" y="3" width="16" height="14" rx="1" />
        <path d="m4 17-2 4h20l-2-4" />
      </>
    ),
    Settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="m9 2 6 0 1 3 3 1 3 3-2 3 2 3-3 3-3 1-1 3H9l-1-3-3-1-3-3 2-3-2-3 3-3 3-1z" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m15 15 6 6" />
      </>
    ),
    menu: <path d="M3 5h18M3 12h18M3 19h18" />,
    plus: <path d="M12 4v16M4 12h16" />,
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 10v7M12 6v1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}
export function Field({label, children}: {label: string; children: ReactNode}) {
  const labelId = useId();
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {Children.map(children, child =>
        isValidElement(child) && ['input', 'select', 'textarea'].includes(String(child.type))
          ? cloneElement(child as ReactElement<Record<string, unknown>>, {'aria-labelledby': labelId})
          : child,
      )}
    </label>
  );
}
export function Empty({title, children}: {title: string; children?: ReactNode}) {
  return (
    <div className="empty">
      <Icon name="info" />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function JsonEditor({
  label,
  value,
  onApply,
}: {
  label: string;
  value: unknown;
  onApply: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  return (
    <div className="json-editor">
      <Field label={label}>
        <textarea spellCheck={false} className="code" value={text} onChange={e => setText(e.target.value)} />
      </Field>
      <button
        onClick={() => {
          try {
            onApply(JSON.parse(text));
            setError('');
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Apply {label.toLowerCase()}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function JsonView({value}: {value: unknown}) {
  return <pre className="code result">{JSON.stringify(value, null, 2)}</pre>;
}
/**
 * A status stamp for a determined state. Tone `ok` is reserved for what a local check actually established.
 * Without a tone nothing has been determined yet, so the state reads as quiet text rather than a stamp.
 */
export function Stamp({tone, children}: {tone?: 'ok' | 'caution' | 'danger'; children: ReactNode}) {
  return <span className={tone ? 'badge is-' + tone : 'undetermined'}>{children}</span>;
}
export function Alert({children}: {children: ReactNode}) {
  return (
    <div className="alert" role="status">
      <Icon name="info" />
      {children}
    </div>
  );
}

export function StringList({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: unknown[];
  options?: {id: string; name?: string}[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const strings = value.filter((v): v is string => typeof v === 'string');
  const invalid = strings.length !== value.length;
  function add() {
    const next = draft.trim();
    if (!next || invalid) return;
    if (strings.includes(next)) {
      setError('This value is already listed.');
      return;
    }
    onChange([...strings, next]);
    setDraft('');
    setError('');
  }
  return (
    <fieldset className="string-list">
      <legend>{label}</legend>
      {strings.length > 0 ? (
        <ul>
          {strings.map((v, index) => (
            <li key={v + index}>
              <span>{options ? options.find(o => o.id === v)?.name || `Missing record: ${v}` : v}</span>
              <button
                type="button"
                disabled={invalid}
                aria-label={`Remove ${options?.find(o => o.id === v)?.name || v} from ${label.toLowerCase()}`}
                onClick={() => onChange(strings.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None added</p>
      )}
      <div className="list-add">
        {options ? (
          <select aria-label={`Add ${label.toLowerCase()}`} value={draft} onChange={e => setDraft(e.target.value)}>
            <option value="">Select a record</option>
            {options
              .filter(o => !strings.includes(o.id))
              .map(o => (
                <option value={o.id} key={o.id}>
                  {o.name || o.id}
                </option>
              ))}
          </select>
        ) : (
          <input
            aria-label={`Add ${label.toLowerCase()}`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        )}
        <button type="button" disabled={invalid || !draft.trim()} onClick={add}>
          Add
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {invalid && <p role="alert">This imported list contains non-text values. Review advanced JSON before editing.</p>}
    </fieldset>
  );
}
