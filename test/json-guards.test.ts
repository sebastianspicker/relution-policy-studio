import assert from "node:assert/strict";
import test from "node:test";
import { uniqueStrings } from "../src/utils/json-guards.js";

test("uniqueStrings sorts when requested", () => {
  assert.deepEqual(uniqueStrings(["b", "a", "a"], { sort: true }), ["a", "b"]);
});

test("uniqueStrings preserves insertion order when sorting is disabled", () => {
  assert.deepEqual(uniqueStrings(["b", "a", "a"], { sort: false }), ["b", "a"]);
});

test("uniqueStrings drops empty and undefined values", () => {
  assert.deepEqual(uniqueStrings(["b", undefined, "", "a"]), ["b", "a"]);
});
