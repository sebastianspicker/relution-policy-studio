/** Defers feature code with keyboard-accessible loading, error and retry states. */
import { Component, Suspense, lazy, useMemo, useState, type ComponentType, type ReactNode } from "react";

class DeferredErrorBoundary extends Component<{ readonly children: ReactNode; readonly onRetry: () => void }, { readonly failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override render(): ReactNode {
    if (this.state.failed) return <div><p role="alert">This workspace could not be loaded.</p><button type="button" onClick={this.props.onRetry}>Retry loading workspace</button></div>;
    return this.props.children;
  }
}

export function deferredComponent<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>): ComponentType<Props> {
  return function DeferredComponent(props: Props) {
    const [attempt, setAttempt] = useState(0);
    const Feature = useMemo(() => lazy(load) as ComponentType<Props>, [attempt]);
    return <DeferredErrorBoundary key={attempt} onRetry={() => setAttempt((value) => value + 1)}><Suspense fallback={<p role="status">Loading workspace…</p>}><Feature {...props} /></Suspense></DeferredErrorBoundary>;
  };
}
