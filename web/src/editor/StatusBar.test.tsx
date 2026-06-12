import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "./StatusBar.js";
import { createEditorControllerStub } from "./useEditorController.test-helpers.js";

describe("StatusBar", () => {
  it("announces download failures as errors", () => {
    render(<StatusBar controller={createEditorControllerStub({ status: "Download failed: network down" })} />);

    expect(screen.getByRole("alert").textContent).toContain("Download failed: network down");
  });

  it("does not claim saved after a failed action leaves sync state uncertain", () => {
    render(
      <StatusBar
        controller={createEditorControllerStub({
          isDirty: false,
          status: "Build failed: verification failed",
          lastActionResult: { ok: false, error: "verification failed" },
        })}
      />,
    );

    expect(screen.getByText("Sync unknown")).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Build failed");
  });
});
