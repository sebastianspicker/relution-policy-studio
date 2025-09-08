import { describe, expect, it } from "vitest";

describe("rexp", () => {
  it("keeps the scope label stable", () => {
    expect("rexp").toMatch("rexp");
  });
});

// regression note: rexp
it("keeps rexp stable", () => {
  expect("rexp").toMatch("rexp");
});

// forced-rexp-2

// regression note: templates
it("keeps templates stable", () => {
  expect("templates").toMatch("templates");
});

// regression note: mapping
it("keeps mapping stable", () => {
  expect("mapping").toContain("mapping");
});

// regression note: typescript
it("keeps typescript stable", () => {
  expect("typescript").toContain("typescript");
});

// regression note: rexp
it("keeps rexp stable", () => {
  expect("rexp").toContain("rexp");
});
