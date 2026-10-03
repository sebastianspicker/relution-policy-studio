import type {CampusWeaveProfile, CampusWeaveProject} from 'rexp-studio/browser';
export type Row = Record<string, unknown> & {id: string; name?: string};
export interface Intent extends Row {
  name: string;
  outcome: string;
  platform: string;
  ownership: string;
  role: string;
  cohort_ids: string[];
  layer: number | null;
  scope_ids: string[];
  depends_on: string[];
  requirements: unknown[];
}
/** The engine keeps planner-owned profile collections opaque; the workbench edits them as records and intents. */
type Refine<T, R> = {[K in keyof T as K extends keyof R ? never : K]: T[K]} & R;
export type Profile = Refine<
  CampusWeaveProfile,
  {
    organizations: Row[];
    locations: Row[];
    cohorts: Row[];
    intents: Intent[];
    scope_blueprints: Row[];
    assignments: Row[];
    rollout_stages: Row[];
  }
>;
export type Project = Refine<CampusWeaveProject, {profile: Profile}>;
/** Store listing row; revision and workspace count are optional for older hosts. */
export interface ProjectSummary {
  id: string;
  name: string;
  revision?: number;
  workspace_count?: number;
}
export type Section =
  | 'Overview'
  | 'Institution'
  | 'Intent'
  | 'Policies'
  | 'Evidence'
  | 'Review'
  | 'Archives'
  | 'Device assessment'
  | 'Settings'
  | 'Scope'
  | 'Changes'
  | 'Save & map'
  | 'Artifacts';
export type {EditorController} from 'rexp-studio/ui';
export const sections: Section[] = [
  'Overview',
  'Institution',
  'Intent',
  'Policies',
  'Evidence',
  'Review',
  'Archives',
  'Device assessment',
  'Settings',
];
export const steps: Section[] = ['Scope', 'Changes', 'Save & map', 'Artifacts'];
export const stepLabels: Record<string, string> = {
  Scope: 'Scope',
  Changes: 'Review',
  'Save & map': 'Save & map',
  Artifacts: 'Artifacts',
};
export const blankProfile = (name: string): Profile => ({
  schema_version: 2,
  id: crypto.randomUUID(),
  name,
  organizations: [],
  locations: [],
  cohorts: [],
  intents: [],
  scope_blueprints: [],
  assignments: [],
  rollout_stages: [],
  unresolved: [],
});
export const blankIntent = (): Intent => ({
  id: crypto.randomUUID(),
  name: 'New intent',
  outcome: '',
  platform: '',
  ownership: '',
  role: '',
  cohort_ids: [],
  layer: null,
  scope_ids: [],
  depends_on: [],
  requirements: [],
});
