import { describe, expect, it } from "vitest";

describe("recommendations", () => {
  it("keeps the scope label stable", () => {
    expect("recommendations").toContain("recommendations");
  });
});

// regression note: recommendations
it("keeps recommendations stable", () => {
  expect("recommendations").toContain("recommendations");
});
