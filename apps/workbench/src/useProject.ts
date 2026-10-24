import {useEffect, useRef, useState} from 'react';
import {request, planner, download, RequestError} from './api';
import {blankProfile, type Profile, type Project, type ProjectSummary} from './types';

/** Autosave and explicit workflow saves share one revision-checked queue. */
export function useProject() {
  const [project, setProject] = useState<Project>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState('Loading projects…');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const current = useRef<Project>(undefined);
  const persisted = useRef<Project>(undefined);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const blocked = useRef(false);
  const failing = useRef(false);
  const conflict = useRef(false);
  const [conflicted, setConflicted] = useState(false);

  function markConflict(value: boolean) {
    conflict.current = value;
    setConflicted(value);
  }

  function accept(next: Project) {
    persisted.current = next;
    current.current = next;
    blocked.current = false;
    failing.current = false;
    markConflict(false);
    setProject(next);
    setLoadError('');
    setSaveError('');
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
        failing.current = false;
        setSaveError('');
      } catch (cause) {
        blocked.current = true;
        failing.current = true;
        if (cause instanceof RequestError && cause.status === 409) markConflict(true);
        setSaveError(String(cause));
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
    // A new edit after a non-conflict failure retries autosave; the status stays failed until a save succeeds.
    blocked.current = conflict.current;
    if (next !== persisted.current && !failing.current) setStatus('Unsaved changes');
  }

  async function latestSaved() {
    const result = await request<{project: Project}>(
      '/api/campusweave/project?id=' + encodeURIComponent(persisted.current!.id),
    );
    return result.project;
  }

  /** Adopts the saved project after a server-side change (such as a failed workspace creation) when nothing is unsaved. */
  async function refreshSaved() {
    if (!persisted.current || pending.current || current.current !== persisted.current) return;
    accept(await latestSaved());
  }

  async function downloadLatest() {
    download(await latestSaved(), 'latest-saved-project.json');
  }

  async function discardAndLoadLatest() {
    if (!window.confirm('Discard the unsaved changes in this tab and load the latest saved project?')) return;
    accept(await latestSaved());
  }

  async function keepOnTopOfLatest() {
    if (
      !window.confirm("Replace the latest saved version with this tab's project? Other saved changes are overwritten.")
    )
      return;
    const latest = await latestSaved();
    persisted.current = latest;
    current.current = {...current.current!, revision: latest.revision};
    blocked.current = false;
    markConflict(false);
    setProject(current.current);
    setSaveError('');
  }

  async function restore(file: File) {
    const saved = JSON.parse(await file.text()) as Project;
    if (!persisted.current || saved?.id !== persisted.current.id)
      throw new Error('This recovery copy belongs to a different project than the one open.');
    const lists = ['mappings', 'evidence', 'workspace_refs', 'operations'] as const;
    if (typeof saved.profile !== 'object' || saved.profile === null || !lists.every(key => Array.isArray(saved[key])))
      throw new Error('This file is not a project recovery copy.');
    if (!window.confirm('Replace the project in this tab with the recovery copy?')) return;
    // Workspace attachments and operations belong to the host; keep its current ones.
    const base = persisted.current!;
    update(() => ({
      ...saved,
      revision: base.revision,
      workspace_refs: base.workspace_refs,
      operations: base.operations,
    }));
  }

  useEffect(() => {
    void refresh()
      .then(async () => {
        const id = sessionStorage.getItem('campusweave:project');
        if (id) await open(id);
        else setStatus('Choose a project');
      })
      .catch(cause => setLoadError(String(cause)))
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
    loadError,
    saveError,
    conflicted,
    downloadLatest,
    refreshSaved,
    discardAndLoadLatest,
    keepOnTopOfLatest,
    restore,
    loading,
    create,
    open,
    update,
    flush,
    refresh,
    retry: () => {
      if (conflict.current) return;
      blocked.current = false;
      void flush().catch(() => {});
    },
    setLoadError,
  };
}
