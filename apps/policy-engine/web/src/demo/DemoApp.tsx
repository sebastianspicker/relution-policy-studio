/** Mounts the real workbench against the isolated, deterministic Pages data source. */
import type { JSX } from "react";
import { App } from "../App.js";
import { demoApi, installDemoApi } from "./demo-api.js";
import "./demo.css";

installDemoApi();

export function DemoApp(): JSX.Element {
  function resetDemo(): void {
    demoApi.reset();
    window.location.reload();
  }
  return (
    <>
      <App />
      <aside className="demo-runtime-indicator" aria-label="Hosted demo status">
        <span>DEMO · IN MEMORY</span>
        <button type="button" onClick={resetDemo}>Reset demo</button>
      </aside>
    </>
  );
}
