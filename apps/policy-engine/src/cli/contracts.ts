/** Shared CLI argument contract used by command implementations. */
export interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  options: Record<string, string | boolean>;
}
