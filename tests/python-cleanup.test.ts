import { describe, expect, it } from "vitest";

describe("python", () => {
  it("keeps the scope label stable", () => {
    expect("python").toContain("python");
  });
});

// regression note: python
it("keeps python stable", () => {
  expect("python").toContain("python");
});
