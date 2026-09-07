/** Tracks explicit compliance activity independently from workspace request state. */
import type { ActivityRequest } from "./editor-workspace-request-guard.js";

const complianceActivities = new WeakMap<object, { latest: number; active: Set<number> }>();

export function beginExplicitComplianceActivity(key: object): ActivityRequest {
  const activity = complianceActivities.get(key) ?? { latest: 0, active: new Set<number>() };
  const request = { intent: activity.latest + 1 };
  activity.latest = request.intent;
  activity.active.add(request.intent);
  complianceActivities.set(key, activity);
  return request;
}

export function finishExplicitComplianceActivity(key: object, request: ActivityRequest): boolean {
  const activity = complianceActivities.get(key);
  if (activity === undefined) return false;
  activity.active.delete(request.intent);
  return request.intent === activity.latest;
}

export function hasExplicitComplianceActivity(key: object): boolean {
  return (complianceActivities.get(key)?.active.size ?? 0) > 0;
}
