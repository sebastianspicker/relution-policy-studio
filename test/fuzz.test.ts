import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { decryptRelutionPayload, encryptRelutionPayload } from "../src/rexp.js";
import { uniqueStrings } from "../src/utils/json-guards.js";
import { readZip, writeZip, type ZipEntryInput } from "../src/zip.js";

const fuzzRuns = Number.parseInt(process.env.FUZZ_RUNS ?? "64", 10);

test("fuzz: Relution encrypted payload framing round-trips arbitrary bytes", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ maxLength: 4096 }),
      fc.string({ minLength: 1, maxLength: 128 }),
      fc.uint8Array({ minLength: 20, maxLength: 20 }),
      (plaintextBytes, password, randomBytes) => {
        const random = Buffer.from(randomBytes);
        const payload = encryptRelutionPayload(Buffer.from(plaintextBytes), password, (size) => {
          assert.equal(size === 8 || size === 12, true);
          return size === 8 ? random.subarray(0, 8) : random.subarray(8, 20);
        });

        assert.deepEqual(decryptRelutionPayload(payload, password), Buffer.from(plaintextBytes));
      },
    ),
    { numRuns: fuzzRuns },
  );
});

test("fuzz: ZIP writer and reader preserve arbitrary small stored entries", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(
        fc.record({
          name: fc.stringMatching(/^[a-zA-Z0-9_.-]{1,24}$/),
          data: fc.uint8Array({ maxLength: 2048 }),
        }),
        { maxLength: 16, selector: (entry) => entry.name },
      ),
      (entries) => {
        const input: ZipEntryInput[] = entries.map((entry) => ({
          name: entry.name,
          data: Buffer.from(entry.data),
        }));

        const output = readZip(writeZip(input), {
          maxEntries: 32,
          maxTotalCompressedBytes: 128 * 1024,
          maxTotalUncompressedBytes: 128 * 1024,
        });

        assert.deepEqual(
          output.map((entry) => ({ name: entry.name, data: entry.data })),
          input,
        );
      },
    ),
    { numRuns: fuzzRuns },
  );
});

test("fuzz: uniqueStrings keeps first non-empty occurrence or sorted unique output", () => {
  fc.assert(
    fc.property(
      fc.array(fc.option(fc.string(), { nil: undefined }), { maxLength: 128 }),
      fc.boolean(),
      (values, sort) => {
        const output = uniqueStrings(values, { sort });
        const expected = [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];

        assert.deepEqual(output, sort ? expected.sort() : expected);
      },
    ),
    { numRuns: fuzzRuns },
  );
});
