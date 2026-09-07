/** Validates canonical policy paths before workspace file access. */
const POLICY_PATH_PATTERN = /^policies\/policy_[A-Za-z0-9_-]+\.json$/u;

export function isPolicyPath(path: string): boolean {
  return POLICY_PATH_PATTERN.test(path);
}

export function policyPathCollisionKey(path: string): string {
  return path.normalize("NFC").toLowerCase();
}
