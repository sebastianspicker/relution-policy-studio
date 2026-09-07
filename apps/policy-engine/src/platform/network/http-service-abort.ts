/** Races asynchronous HTTP work against a deadline without leaking late results. */
export interface AbortRaceOptions<T> {
  onAbort?: (reason: unknown) => void | Promise<void>;
  disposeLateValue?: (value: T) => void | Promise<void>;
}

export async function waitForAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  options: AbortRaceOptions<T> = {},
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      runIgnoringFailure(options.onAbort, signal.reason);
      reject(signal.reason);
    };
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    void operation.then(
      (value) => {
        if (settled) {
          runIgnoringFailure(options.disposeLateValue, value);
          return;
        }
        settle(() => resolve(value));
      },
      (error: unknown) => settle(() => reject(error)),
    );
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function runIgnoringFailure<T>(
  operation: ((value: T) => void | Promise<void>) | undefined,
  value: T,
): void {
  if (operation === undefined) return;
  try {
    void Promise.resolve(operation(value)).catch(() => undefined);
  } catch {
    // Cleanup failure must not replace the deadline or primary operation result.
  }
}
