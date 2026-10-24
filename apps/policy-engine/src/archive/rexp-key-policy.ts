/** Rejects weak keys only when creating a new archive; legacy archives stay readable. */
const MIN_LENGTH = 16;
const MIN_DISTINCT_CHARACTERS = 8;
const OBVIOUS_DEFAULT_LETTERS = /^(?:password|changeme|secret|key|passphrase)+$/u;

/** Describes why a passphrase may not protect a new archive, or returns undefined when it may. */
export function newArchiveKeyProblem(password: string): string | undefined {
  if (password.length < MIN_LENGTH) return `New archive passphrase must be at least ${String(MIN_LENGTH)} characters.`;
  if (password !== password.trim()) return "New archive passphrase must not start or end with spaces.";
  if (new Set(password).size < MIN_DISTINCT_CHARACTERS) {
    return `New archive passphrase must use at least ${String(MIN_DISTINCT_CHARACTERS)} different characters.`;
  }
  if (OBVIOUS_DEFAULT_LETTERS.test(password.toLowerCase().replace(/[^a-z]/gu, ""))) {
    return "New archive passphrase must not be an obvious default such as \"password\" or \"changeme\".";
  }
  return undefined;
}

export function assertNewArchiveKey(password: string): void {
  const problem = newArchiveKeyProblem(password);
  if (problem !== undefined) throw new Error(problem);
}
