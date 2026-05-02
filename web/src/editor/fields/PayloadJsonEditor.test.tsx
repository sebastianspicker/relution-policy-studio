import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PayloadJsonEditor } from "./PayloadJsonEditor.js";

describe("PayloadJsonEditor", () => {
  it("preserves the current draft across same-entity prop refreshes", () => {
    const { rerender } = render(
      <PayloadJsonEditor draftKey="CONFIG-1" payloadJson='{"server":true}' onApply={vi.fn()} onError={vi.fn()} />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "{\n  \"draft\": true\n}" },
    });

    rerender(
      <PayloadJsonEditor draftKey="CONFIG-1" payloadJson='{"server":false}' onApply={vi.fn()} onError={vi.fn()} />,
    );

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("{\n  \"draft\": true\n}");
  });

  it("resets the draft when a different entity is selected", () => {
    const { rerender } = render(
      <PayloadJsonEditor draftKey="CONFIG-1" payloadJson='{"server":true}' onApply={vi.fn()} onError={vi.fn()} />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "{\n  \"draft\": true\n}" },
    });

    rerender(
      <PayloadJsonEditor draftKey="CONFIG-2" payloadJson='{"server":false}' onApply={vi.fn()} onError={vi.fn()} />,
    );

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("{\"server\":false}");
  });
});
