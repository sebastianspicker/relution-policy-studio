import {useEffect} from 'react';
import type {AssuranceReviewReceipt} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';

/** Receipts wait for the policy draft they describe; they survive navigation between screens. */
let pending: {projectId: string; receipts: AssuranceReviewReceipt[]; revision: string; sawDirty: boolean} | undefined;

export function queueAssuranceReceipt(
  projectId: string,
  receipt: AssuranceReviewReceipt,
  revision: string,
  draftDirty: boolean,
) {
  // Several applies onto one draft are all recorded when that draft is saved.
  if (pending?.projectId === projectId && pending.revision === revision) {
    pending.receipts.push(receipt);
    pending.sawDirty ||= draftDirty;
  } else pending = {projectId, receipts: [receipt], revision, sawDirty: draftDirty};
}

/** Records receipts once the draft is saved (a new workspace revision) and drops them when it is discarded. */
export function usePendingAssuranceReceipt(
  c: EditorController | undefined,
  update: (change: (project: Project) => Project) => void,
) {
  useEffect(() => {
    if (!pending || !c) return;
    if (c.isDirty) {
      pending.sawDirty = true;
      return;
    }
    if (!pending.sawDirty) return;
    const done = pending;
    pending = undefined;
    if (c.state.revision === done.revision) return;
    update(current =>
      current.id === done.projectId
        ? {...current, assurance_reviews: [...(current.assurance_reviews ?? []), ...done.receipts]}
        : current,
    );
  }, [c?.isDirty, c?.state.revision]);
}
