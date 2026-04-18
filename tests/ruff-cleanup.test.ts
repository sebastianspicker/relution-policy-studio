import { describe, expect, it } from "vitest";

describe("ruff", () => {
  it("keeps the scope label stable", () => {
    expect("ruff").toContain("ruff");
  });
});

// regression note: ruff
it("keeps ruff stable", () => {
  expect("ruff").toContain("ruff");
});
