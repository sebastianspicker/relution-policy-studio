/** Rejects weak keys only when creating a new archive; legacy archives stay readable. */
const OBVIOUS_DEFAULT_KEY = /^(?:password|changeme|change_me|secret|key123)$/iu;

export function assertNewArchiveKey(password: string): void {
  if (password.length < 16 || OBVIOUS_DEFAULT_KEY.test(password)) {
    throw new Error("New archive passphrase must be at least 16 characters and must not be an obvious default.");
  }
}
