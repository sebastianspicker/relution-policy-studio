import { useEffect, useState, type JSX } from "react";
import { EditorShell } from "./editor/EditorShell.js";
import { StatusBar } from "./editor/StatusBar.js";
import { readCorporateTheme, themeStorage, writeCorporateTheme, type CorporateTheme } from "./editor/theme.js";
import { useEditorController } from "./editor/useEditorController.js";

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
      <main className="loading" data-theme={theme}>
        <span className="loading-spinner" aria-hidden="true" />
        Loading…
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
      </main>
    );
  }
  return (
    <div className="app-shell" data-theme={theme}>
      <EditorShell controller={controllerResult.controller} theme={theme} onThemeChange={setTheme} />
      <StatusBar controller={controllerResult.controller} />
    </div>
  );
}
