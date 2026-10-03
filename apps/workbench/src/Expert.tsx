import {useState} from 'react';
import type {EditorController} from './types';
import {Alert, Field, JsonEditor, JsonView} from './ui';
import {download, request} from './api';
export function Settings({c, theme, setTheme}: {c: EditorController; theme: string; setTheme: (t: string) => void}) {
  return (
    <div className="page-body settings">
      <h2>Appearance</h2>
      <Field label="Theme">
        <select value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </Field>
      <h2>Archive passphrase</h2>
      <Field label="Passphrase">
        <input
          type="password"
          autoComplete="new-password"
          value={c.keyValue}
          onChange={e => c.setKeyValue(e.target.value)}
        />
      </Field>
      <button disabled={!c.keyValue} onClick={() => void c.setActiveKey()}>
        Set passphrase
      </button>
      <p>{c.state.keySet ? 'Passphrase is set for this session.' : 'No passphrase set.'}</p>
      <p className="muted">Credentials stay outside planning profiles and review exports.</p>
      <ServiceConnection service="relution" />
      <ServiceConnection service="zammad" />
    </div>
  );
}
function ServiceConnection({service}: {service: 'relution' | 'zammad'}) {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [group, setGroup] = useState('');
  const [customer, setCustomer] = useState('');
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState('');
  async function connect() {
    try {
      setResult(
        await request('/api/' + service + '/session', {
          host,
          apiToken: token,
          ...(service === 'zammad' ? {group, customer} : {}),
        }),
      );
      setToken('');
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="service-settings">
      <h2>{service === 'relution' ? 'Relution · read-only' : 'Zammad'}</h2>
      <Field label="Service host">
        <input value={host} onChange={e => setHost(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="API token">
        <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" />
      </Field>
      {service === 'zammad' && (
        <>
          <Field label="Ticket group">
            <input value={group} onChange={e => setGroup(e.target.value)} />
          </Field>
          <Field label="Customer">
            <input value={customer} onChange={e => setCustomer(e.target.value)} />
          </Field>
        </>
      )}
      <button disabled={!host || !token} onClick={() => void connect()}>
        Configure session
      </button>
      <button
        onClick={() =>
          void request('/api/' + service + '/test', {})
            .then(setResult)
            .catch(e => setError(String(e)))
        }
      >
        Test connection
      </button>
      {error && <Alert>{error}</Alert>}
      {result !== undefined && <JsonView value={result} />}
    </section>
  );
}
export function DeviceAssessment() {
  const [query, setQuery] = useState<unknown>({});
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(route: string) {
    setBusy(true);
    try {
      setResult(await request(route, query));
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-body">
      <h2>Read-only device query</h2>
      <p>
        Configure a read-only Relution session in Settings, then inspect the intended scope. No device policy writes are
        supported.
      </p>
      <JsonEditor label="Device query" value={{}} onApply={setQuery} />
      <div className="inline-actions">
        <button disabled={busy} onClick={() => void run('/api/relution/devices/query')}>
          Query devices
        </button>
        <button disabled={busy} onClick={() => void run('/api/relution/devices/audit')}>
          Assess queried scope
        </button>
        <button disabled={busy} onClick={() => void run('/api/relution/devices/assess')}>
          Assess cached devices
        </button>
      </div>
      {busy && <p role="status">Loading device results…</p>}
      {error && <Alert>{error}</Alert>}
      {result !== undefined && (
        <>
          <JsonView value={result} />
          <button onClick={() => download(result, 'device-assessment.json')}>Export assessment</button>
        </>
      )}
      <Ticket />
    </div>
  );
}
function Ticket() {
  const [draft, setDraft] = useState<unknown>({kind: 'non-compliant-device', title: '', body: '', issueId: ''});
  const [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState('');
  return (
    <section className="ticket">
      <h2>Zammad ticket</h2>
      <p>
        Review the exact ticket draft. Creation sends a remote message and uses the existing reconciliation boundary.
      </p>
      <JsonEditor
        label="Ticket draft"
        value={draft}
        onApply={v => {
          setDraft(v);
          setReviewed(false);
        }}
      />
      <label className="checkbox">
        <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I intend to create
        this reviewed ticket in Zammad.
      </label>
      <button
        disabled={!reviewed}
        onClick={() => {
          setReviewed(false);
          void request('/api/zammad/tickets', {draft})
            .then(setResult)
            .catch(e => setError(String(e)));
        }}
      >
        Create reviewed ticket
      </button>
      {error && <Alert>{error}</Alert>}
      {result !== undefined && <JsonView value={result} />}
    </section>
  );
}
