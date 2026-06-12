import assert from "node:assert/strict";
import { type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { HttpError, readJsonBody } from "../src/editor-server-helpers.js";

const JSON_MAX_DEPTH = 200;
const JSON_MAX_ARRAY_ITEMS = 10_000;

test("assertJsonShapeWithinLimits accepts input at the maximum depth", async () => {
  const body = bodyWithNestedArrays(JSON_MAX_DEPTH);

  const parsed = await readBody(body);

  assert.equal(parsed.key, "depth");
});

test("assertJsonShapeWithinLimits rejects input above the maximum depth", async () => {
  await assertJsonShapeRejected(
    bodyWithNestedArrays(JSON_MAX_DEPTH + 1),
    /JSON body exceeds maximum nesting depth 200/u,
  );
});

test("assertJsonShapeWithinLimits accepts arrays at the maximum item count", async () => {
  const parsed = await readBody(bodyWithArrayItems(JSON_MAX_ARRAY_ITEMS));

  assert.equal(parsed.key, "array-items");
});

test("assertJsonShapeWithinLimits rejects arrays above the maximum item count", async () => {
  await assertJsonShapeRejected(
    bodyWithArrayItems(JSON_MAX_ARRAY_ITEMS + 1),
    /JSON array exceeds 10000 items/u,
  );
});

test("assertJsonShapeWithinLimits rejects combined object and array nesting above the maximum depth", async () => {
  await assertJsonShapeRejected(
    bodyWithMixedContainers(JSON_MAX_DEPTH + 1),
    /JSON body exceeds maximum nesting depth 200/u,
  );
});

test("assertJsonShapeWithinLimits accepts valid flat JSON", async () => {
  const parsed = await readBody('{"key":"flat","enabled":true,"count":1,"items":["a","b"],"nested":{"value":"ok"}}');

  assert.equal(parsed.key, "flat");
});

function bodyWithNestedArrays(totalDepth: number): string {
  const arrayDepth = totalDepth - 1;
  return `{"key":"depth","payload":${"[".repeat(arrayDepth)}0${"]".repeat(arrayDepth)}}`;
}

function bodyWithMixedContainers(totalDepth: number): string {
  let value = "0";
  for (let index = 0; index < totalDepth - 1; index += 1) {
    value = index % 2 === 0 ? `[${value}]` : `{"value":${value}}`;
  }
  return `{"key":"mixed","payload":${value}}`;
}

function bodyWithArrayItems(itemCount: number): string {
  return `{"key":"array-items","items":[${Array.from({ length: itemCount }, () => "0").join(",")}]}`;
}

function readBody(body: string): Promise<Record<string, unknown>> {
  return readJsonBody(Readable.from([Buffer.from(body)]) as IncomingMessage);
}

async function assertJsonShapeRejected(body: string, expectedMessage: RegExp): Promise<void> {
  await assert.rejects(
    readBody(body),
    (error: unknown) => error instanceof HttpError && error.status === 413 && expectedMessage.test(error.message),
  );
}
