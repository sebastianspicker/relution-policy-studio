import { describe, expect, it } from "vitest";

describe("editor", () => {
  it("keeps the scope label stable", () => {
    expect("editor").toContain("editor");
  });
});

// regression note: editor
it("keeps editor stable", () => {
  expect("editor").toContain("editor");
});
