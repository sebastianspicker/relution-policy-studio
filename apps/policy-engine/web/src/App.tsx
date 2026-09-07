/** Bootstraps application-wide editor state and theme persistence around the workspace shell. */
import { useEffect, useState, type JSX } from "react";
import { EditorShell } from "./app/EditorShell.js";
import { InlineStatus } from "./ui/InlineStatus.js";
import { StatusBar } from "./app/StatusBar.js";
import { readCorporateTheme, themeStorage, writeCorporateTheme, type CorporateTheme } from "./features/settings/theme.js";
import { useEditorController } from "./app/useEditorController.js";

export function App(): JSX.Element {
  const controllerResult = useEditorController();
  const [theme, setTheme] = useState<CorporateTheme>(() => readCorporateTheme(themeStorage()));

  useEffect(() => {
    writeCorporateTheme(themeStorage(), theme);

    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  if (controllerResult.kind === "loading") {
    return (
      <main className="loading" data-theme={theme} aria-labelledby="loading-title">
        <span className="loading-spinner" aria-hidden="true" />
        <h1 id="loading-title" className="visually-hidden">Loading policy workbench</h1>
        <InlineStatus kind="loading">Loading workspace and local evidence…</InlineStatus>
      </main>
    );
  }
  if (controllerResult.kind === "error") {
    return (
      <main className="loading load-failure" data-theme={theme}>
        <h1>Editor API unavailable</h1>
        <p>{controllerResult.message}</p>
        <p>
          Start the local editor server with <code>pnpm rexp</code>. Raw <code>pnpm exec vite preview</code> serves only static assets and has no editor API.
        </p>
        <InlineStatus kind="error" onRetry={() => window.location.reload()}>The local editor API could not be reached.</InlineStatus>
      </main>
    );
  }
  return (
    <div className="app-shell" data-theme={theme}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to main content
      </a>
      <EditorShell controller={controllerResult.controller} theme={theme} onThemeChange={setTheme} />
      <StatusBar controller={controllerResult.controller} />
    </div>
  );
}
