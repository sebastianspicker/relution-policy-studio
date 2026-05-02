import { createContext, useCallback, useContext, useRef, useState, type JSX, type ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";

export type Toast = {
  readonly id: number;
  readonly message: string;
  readonly kind: ToastKind;
};

type ToastContextValue = {
  readonly toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
    const delay = kind === "error" ? 8000 : 4000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, delay);
  }, []);

  function dismiss(id: number): void {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 ? (
        <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.kind}`}>
              <span className="toast-message">{t.message}</span>
              <button
                type="button"
                className="toast-dismiss"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
