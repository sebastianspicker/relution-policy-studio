/** Applies one timeout budget to service DNS, request, and response work. */
export function httpServiceRequestDeadline(parentSignal: AbortSignal | null | undefined, timeoutMs: number): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`HTTP service request exceeded ${String(timeoutMs)}ms`)), timeoutMs);
  const forwardAbort = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted === true) forwardAbort();
  else parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", forwardAbort);
    },
  };
}
