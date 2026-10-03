import {Activity, useEffect, useRef, useState} from 'react';
import {useEditorController} from 'rexp-studio/ui';
import {useProject} from './useProject';
import {sections, steps, stepLabels, type Section} from './types';
import {Alert, Empty, Icon} from './ui';
import {Institution, IntentScreen, Overview, ProfileTools} from './Planning';
import {Policies} from './Policies';
import {Archives} from './Artifacts';
import {Evidence, Review} from './Evidence';
import {DeviceAssessment, Settings} from './Expert';
import {Scope} from './Scope';
import {ReviewChanges} from './ReviewChanges';
import {SaveMap} from './SaveMap';
import {ArtifactFlow} from './ArtifactFlow';
import {download} from './api';
const descriptions: Partial<Record<Section, string>> = {
  Institution:
    'Organizations, locations, cohorts and blueprints that scope can refer to. Identifiers stay stable when names change.',
  Intent: 'The outcomes policy has to achieve, recorded before any setting is chosen.',
  Policies: 'Author configurations in a policy workspace, validate them and build the archive.',
  Evidence: 'Attach archive and file hashes to the intent they support.',
  Review: 'What is built, what is evidenced and what is still open, exported as one review package.',
  Archives: 'Inspect, import and build authenticated .rexp archives. Editor sidecar artifacts stay separate.',
  Settings: 'Theme, archive passphrase and read-only service sessions for this machine.',
};
function initialSection(): Section {
  const value = new URLSearchParams(location.search).get('view');
  return [...sections, ...steps].includes(value as Section) ? (value as Section) : 'Overview';
}
export default function App() {
  const editor = useEditorController();
  const p = useProject();
  const [section, setSection] = useState<Section>(initialSection);
  const [scopeDirty, setScopeDirty] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('campusweave:theme') ?? 'light');
  const tools = useRef<HTMLDetailsElement>(null);
  const main = useRef<HTMLElement>(null);
  const c = editor.kind === 'ready' ? editor.controller : undefined;
  const guided = steps.includes(section);
  function navigate(next: Section) {
    setSection(next);
    if (tools.current) tools.current.open = false;
    const url = new URL(location.href);
    url.searchParams.set('view', next);
    history.pushState(null, '', url);
    requestAnimationFrame(() => {
      const heading = [...(main.current?.querySelectorAll<HTMLHeadingElement>('h1') ?? [])].find(
        node => node.getClientRects().length > 0,
      );
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({preventScroll: true});
      }
      window.scrollTo({top: 0});
    });
  }
  function reloadWorkspace() {
    const url = new URL(location.href);
    url.searchParams.set('view', 'Changes');
    history.replaceState(null, '', url);
    location.reload();
  }
  useEffect(() => {
    const handler = () => setSection(initialSection());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    localStorage.setItem('campusweave:theme', theme);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (scopeDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [scopeDirty]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && tools.current?.open) {
        tools.current.open = false;
        tools.current.querySelector('summary')?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (tools.current?.open && !tools.current.contains(event.target as Node)) tools.current.open = false;
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  const saveText = scopeDirty
    ? 'Scope draft not saved'
    : c?.isDirty
      ? 'Policy draft not saved'
      : p.project
        ? p.status
        : 'No project open';
  const saveState =
    scopeDirty || c?.isDirty || p.status === 'Unsaved changes' || p.status === 'Saving…'
      ? 'pending'
      : p.error
        ? 'failed'
        : p.project && p.status === 'Saved locally'
          ? 'saved'
          : 'idle';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="masthead">
        <button className="wordmark" onClick={() => navigate('Overview')} aria-label="Relution Policy Studio projects">
          <span className="wordmark-kicker">Relution</span>
          <span className="wordmark-name">Policy Studio</span>
        </button>
        <div className="project-breadcrumb">
          <button onClick={() => navigate('Overview')}>Projects</button>
          <span aria-hidden="true">/</span>
          <strong>{p.project?.name ?? 'No project open'}</strong>
        </div>
        <details className="project-tools" ref={tools}>
          <summary>
            Project tools
            <Icon name="menu" size={17} />
          </summary>
          <div className="tools-panel">
            <label className="field">
              <span>Open project</span>
              <select
                disabled={scopeDirty || c?.isDirty || (p.status !== 'Saved locally' && !!p.project)}
                value={p.project?.id ?? ''}
                onChange={event => {
                  if (event.target.value)
                    void p
                      .open(event.target.value)
                      .then(() => navigate('Scope'))
                      .catch(cause => p.setError(String(cause)));
                }}
              >
                <option value="">Choose a project</option>
                {p.projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <nav aria-label="Project tools">
              {sections.map(item => (
                <button key={item} aria-current={section === item ? 'page' : undefined} onClick={() => navigate(item)}>
                  <Icon name={item} size={18} />
                  {item === 'Review'
                    ? 'Review package'
                    : item === 'Overview'
                      ? 'Projects'
                      : item === 'Policies'
                        ? 'Policy tools'
                        : item}
                </button>
              ))}
            </nav>
          </div>
        </details>
      </header>
      <div className="sheet-bar">
        <nav aria-label="Policy preparation">
          <ol>
            {steps.map((item, index) => (
              <li key={item}>
                <button
                  disabled={!p.project}
                  onClick={() => navigate(item)}
                  aria-current={section === item ? 'step' : undefined}
                >
                  <span className="sheet-no">
                    <span className="sheet-word">Sheet </span>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="sheet-name">{stepLabels[item]}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className={'sheet-state is-' + saveState} role="status">
          <span className="sheet-no">{p.project ? 'Revision ' + p.project.revision : 'Revision'}</span>
          <span className="sheet-name">
            <i aria-hidden="true" />
            {saveText}
          </span>
        </div>
      </div>
      <main id="main" ref={main} tabIndex={-1}>
        {p.error && (
          <div className="recovery">
            <Alert>{p.error}</Alert>
            <button onClick={p.retry}>Retry save</button>
            {p.project && (
              <button onClick={() => download(p.project, 'unsaved-project-recovery.json')}>
                Export unsaved recovery copy
              </button>
            )}
            <p>Changes remain in this tab. Reopen the project in a new tab to compare revisions before retrying.</p>
          </div>
        )}
        {editor.kind === 'error' && <Alert>{editor.message}</Alert>}
        {c?.status && (!guided || c.lastActionResult?.ok === false) && (
          <div className="policy-status" role={c.lastActionResult?.ok === false ? 'alert' : 'status'}>
            {c.status}
            {c.isDirty ? ' · Policy changes unsaved' : ''}
          </div>
        )}
        {!guided && section !== 'Overview' && (
          <header className="page-heading">
            <h1 tabIndex={-1}>
              {section === 'Intent'
                ? 'Policy intent'
                : section === 'Review'
                  ? 'Review package'
                  : section === 'Policies' && c?.policy
                    ? String(c.policy.document.name ?? 'Policy tools')
                    : section}
            </h1>
            {descriptions[section] && <p>{descriptions[section]}</p>}
          </header>
        )}
        <div className="screen-content">
          {c && p.project && (
            <Activity mode={section === 'Scope' ? 'visible' : 'hidden'}>
              <Scope
                key={p.project.id}
                project={p.project}
                c={c}
                status={p.status}
                update={p.update}
                flush={p.flush}
                navigate={navigate}
                reloadWorkspace={reloadWorkspace}
                onDirtyChange={setScopeDirty}
              />
            </Activity>
          )}
          {c && p.project && (
            <Activity mode={section === 'Changes' ? 'visible' : 'hidden'}>
              <ReviewChanges
                key={p.project.id}
                project={p.project}
                c={c}
                update={p.update}
                onContinue={() => navigate('Save & map')}
                onBack={() => navigate('Scope')}
              />
            </Activity>
          )}
          {c && p.project && (
            <Activity mode={section === 'Save & map' ? 'visible' : 'hidden'}>
              <SaveMap
                key={p.project.id}
                c={c}
                project={p.project}
                update={p.update}
                projectSaved={p.status === 'Saved locally'}
                onContinue={() => navigate('Artifacts')}
                onBack={() => navigate('Changes')}
              />
            </Activity>
          )}
          {c && p.project && (
            <Activity mode={section === 'Artifacts' ? 'visible' : 'hidden'}>
              <ArtifactFlow
                key={p.project.id}
                c={c}
                project={p.project}
                projectSaved={p.status === 'Saved locally'}
                navigate={navigate}
              />
            </Activity>
          )}
          {section === 'Overview' ? (
            <Overview
              project={p.project}
              projects={p.projects}
              openBlocked={scopeDirty || !!c?.isDirty || (p.status !== 'Saved locally' && !!p.project)}
              open={p.open}
              create={async (name, reference) => {
                if (scopeDirty || c?.isDirty)
                  throw new Error('Save the current scope and policy drafts before creating another project.');
                await p.create(name, reference);
                navigate('Scope');
              }}
              navigate={navigate}
            />
          ) : section === 'Device assessment' ? (
            <DeviceAssessment />
          ) : section === 'Settings' && c ? (
            <Settings c={c} theme={theme} setTheme={setTheme} />
          ) : section === 'Archives' && c ? (
            <Archives c={c} />
          ) : section === 'Policies' && c ? (
            <Policies
              c={c}
              projectSaved={p.status === 'Saved locally'}
              project={p.project}
              update={p.update}
              navigate={navigate}
              onWorkspaceChange={() => location.reload()}
            />
          ) : !p.project ? (
            <Empty title={p.loading ? 'Loading projects…' : 'Open or create a project'}>
              <button className="primary" onClick={() => navigate('Overview')}>
                Go to projects
              </button>
            </Empty>
          ) : section === 'Institution' ? (
            <>
              <Institution project={p.project} update={p.update} />
              <ProfileTools project={p.project} update={p.update} />
            </>
          ) : section === 'Intent' ? (
            <IntentScreen project={p.project} update={p.update} navigate={navigate} />
          ) : section === 'Evidence' && c ? (
            <Evidence project={p.project} update={p.update} c={c} />
          ) : section === 'Review' ? (
            <Review project={p.project} navigate={navigate} saved={p.status === 'Saved locally'} />
          ) : (
            !c && (
              <p className="page-body" role="status">
                Loading policy workspace…
              </p>
            )
          )}
        </div>
      </main>
      <footer className="colophon">
        <span>
          Local workbench <code>{location.host}</code>
        </span>
        <span>Scope describes intent, not device inventory. Relution stays read-only.</span>
      </footer>
    </div>
  );
}
