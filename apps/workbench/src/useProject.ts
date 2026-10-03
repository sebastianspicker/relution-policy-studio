import {useEffect, useRef, useState} from 'react';
import {request, planner} from './api';
import {blankProfile, type Profile, type Project, type ProjectSummary} from './types';

/** Autosave and explicit workflow saves share one revision-checked queue. */
export function useProject() {
  const [project, setProject] = useState<Project>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState('Loading projects…');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const current = useRef<Project>(undefined);
  const persisted = useRef<Project>(undefined);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const blocked = useRef(false);

  function accept(next: Project) {
    persisted.current = next;
    current.current = next;
    blocked.current = false;
    setProject(next);
    setError('');
    setStatus('Saved locally');
    sessionStorage.setItem('campusweave:project', next.id);
  }

  async function refresh() {
    const result = await request<{projects: ProjectSummary[]} | ProjectSummary[]>('/api/campusweave/projects');
    setProjects(Array.isArray(result) ? result : result.projects);
  }

  async function open(id: string) {
    if (pending.current || current.current !== persisted.current)
      throw new Error('Save or export your unsaved project before switching.');
    const result = await request<{project: Project}>('/api/campusweave/project?id=' + encodeURIComponent(id));
    accept(result.project);
  }

  async function create(name: string, reference: boolean) {
    if (pending.current || current.current !== persisted.current)
      throw new Error('Wait for the current project to save before creating another.');
    const data = reference ? await planner<Profile | {profile: Profile}>('reference', {}) : blankProfile(name);
    const profile = {...('schema_version' in data ? data : data.profile), name};
    const result = await request<{project: Project}>('/api/campusweave/projects', {name, profile});
    accept(result.project);
    await refresh();
  }

  async function flush(): Promise<Project | undefined> {
    while (pending.current) await pending.current;
    if (blocked.current)
      throw new Error('The project save failed. Resolve the reported error and retry before continuing.');
    if (!current.current || current.current === persisted.current) return current.current;
    const snapshot = current.current;
    setStatus('Saving…');
    pending.current = (async () => {
      try {
        const {project: next} = await request<{project: Project}>('/api/campusweave/project', {
          project: snapshot,
          expectedRevision: persisted.current?.revision,
        });
        persisted.current = next;
        const latest = current.current === snapshot ? next : {...current.current!, revision: next.revision};
        current.current = latest;
        setProject(latest);
        setProjects(rows =>
          rows.map(row => (row.id === next.id ? {...row, name: next.name, revision: next.revision} : row)),
        );
        setStatus(latest === next ? 'Saved locally' : 'Unsaved changes');
        setError('');
      } catch (cause) {
        blocked.current = true;
        setError(String(cause));
        setStatus('Save failed · changes kept in this tab');
        throw cause;
      } finally {
        pending.current = undefined;
      }
    })();
    await pending.current;
    return current.current !== persisted.current ? flush() : current.current;
  }

  function update(change: (project: Project) => Project) {
    if (!current.current) return;
    const next = change(current.current);
    current.current = next;
    setProject(next);
    if (next !== persisted.current) setStatus('Unsaved changes');
  }

  useEffect(() => {
    void refresh()
      .then(async () => {
        const id = sessionStorage.getItem('campusweave:project');
        if (id) await open(id);
        else setStatus('Choose a project');
      })
      .catch(cause => setError(String(cause)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!project || project === persisted.current || blocked.current) return;
    const timer = setTimeout(() => void flush().catch(() => {}), 650);
    return () => clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (current.current !== persisted.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, []);

  return {
    project,
    projects,
    status,
    error,
    loading,
    create,
    open,
    update,
    flush,
    refresh,
    retry: () => {
      blocked.current = false;
      void flush().catch(() => {});
    },
    setError,
  };
}
