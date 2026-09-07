/** Coordinates workspace request epochs so stale responses cannot overwrite newer edits. */
export type WorkspaceRequest = { readonly revision: number; readonly intent: number };
export type ActivityRequest = { readonly intent: number };

/**
 * Tracks workspace revisions and intent tokens so stale responses cannot overwrite newer edits.
 * Exclusive operations intentionally block conflicting mutations until they finish.
 */
export class WorkspaceRequestGuard {
  private revisionValue = 0;
  private workspaceIntentValue = 0;
  private exclusiveMutationIntent: number | undefined;
  private buildActivityIntent = 0;
  private selectionValue: string | undefined;

  get revision(): number { return this.revisionValue; }
  begin(): WorkspaceRequest { return { revision: this.revisionValue, intent: ++this.workspaceIntentValue }; }
  isCurrent(request: WorkspaceRequest): boolean { return this.revisionValue === request.revision && this.workspaceIntentValue === request.intent; }
  beginExclusiveMutation(): WorkspaceRequest | undefined {
    if (this.exclusiveMutationIntent !== undefined) return undefined;
    const request = this.begin();
    this.exclusiveMutationIntent = request.intent;
    return request;
  }
  isExclusiveCurrent(request: WorkspaceRequest): boolean { return this.exclusiveMutationIntent === request.intent; }
  isApplicable(request: WorkspaceRequest): boolean { return this.isCurrent(request) || this.isExclusiveCurrent(request); }
  finishExclusiveMutation(request: WorkspaceRequest): void {
    if (this.isExclusiveCurrent(request)) this.exclusiveMutationIntent = undefined;
  }
  canEditWorkspace(): boolean { return this.exclusiveMutationIntent === undefined; }
  beginBuildActivity(request: WorkspaceRequest): ActivityRequest { this.buildActivityIntent = request.intent; return { intent: request.intent }; }
  finishBuildActivity(request: ActivityRequest): boolean { return request.intent === this.buildActivityIntent; }
  recordEdit(): boolean {
    if (!this.canEditWorkspace()) return false;
    this.revisionValue += 1;
    return true;
  }
  synchronizeSelection(selection: string): void {
    if (this.selectionValue !== undefined && this.selectionValue !== selection) this.recordEdit();
    this.selectionValue = selection;
  }
}
