/** ZIP64, UTF-8, and writer-boundary regressions. */
import assert from "node:assert/strict";
import test from "node:test";
import { readZip, writeZip } from "../../src/archive/zip.js";

function centralDirectoryOffsetOf(archive: Buffer): number {
  return archive.readUInt32LE(archive.length - 22 + 16);
}

function withDataDescriptor(archive: Buffer): Buffer {
  const central = centralDirectoryOffsetOf(archive);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(archive.readUInt32LE(central + 16), 4);
  descriptor.writeUInt32LE(archive.readUInt32LE(central + 20), 8);
  descriptor.writeUInt32LE(archive.readUInt32LE(central + 24), 12);
  archive.writeUInt16LE(archive.readUInt16LE(6) | 0x0008, 6);
  archive.fill(0, 14, 26);
  archive.writeUInt16LE(archive.readUInt16LE(central + 8) | 0x0008, central + 8);
  const modified = Buffer.concat([archive.subarray(0, central), descriptor, archive.subarray(central)]);
  modified.writeUInt32LE(central + descriptor.length, modified.length - 22 + 16);
  return modified;
}

test("readZip rejects ZIP64 entry markers and nonzero central disk starts", () => {
  const cases: Array<{ offset: number; value: number; bytes: 2 | 4; error: RegExp }> = [
    { offset: 20, value: 0xffffffff, bytes: 4, error: /ZIP64 archive entries are not supported/u },
    { offset: 24, value: 0xffffffff, bytes: 4, error: /ZIP64 archive entries are not supported/u },
    { offset: 42, value: 0xffffffff, bytes: 4, error: /ZIP64 archive entries are not supported/u },
    { offset: 34, value: 0xffff, bytes: 2, error: /ZIP64 archive entries are not supported/u },
    { offset: 34, value: 1, bytes: 2, error: /Multi-disk ZIP archive entries are not supported/u },
  ];
  for (const item of cases) {
    const archive = writeZip([{ name: "payload.txt", data: Buffer.from("trusted payload") }]); const central = centralDirectoryOffsetOf(archive);
    if (item.bytes === 2) archive.writeUInt16LE(item.value, central + item.offset); else archive.writeUInt32LE(item.value, central + item.offset);
    assert.throws(() => readZip(archive), item.error);
  }
});

test("readZip rejects local ZIP64 markers and invalid central or local UTF-8", () => {
  const descriptor = withDataDescriptor(writeZip([{ name: "payload.txt", data: Buffer.from("trusted payload") }]));
  descriptor.writeUInt32LE(0xffffffff, 18);
  assert.throws(() => readZip(descriptor), /ZIP64 local entry markers are not supported/u);
  const centralInvalid = writeZip([{ name: "payload.txt", data: Buffer.from("trusted payload") }]);
  centralInvalid[centralDirectoryOffsetOf(centralInvalid) + 46] = 0xff;
  assert.throws(() => readZip(centralInvalid), /ZIP entry name is not valid UTF-8/u);
  const localInvalid = writeZip([{ name: "payload.txt", data: Buffer.from("trusted payload") }]); localInvalid[30] = 0xff;
  assert.throws(() => readZip(localInvalid), /ZIP entry name is not valid UTF-8/u);
});

test("writeZip rejects lossy names and 16-bit name or count overflows", () => {
  assert.throws(() => writeZip([{ name: "\ud800", data: Buffer.alloc(0) }]), /losslessly UTF-8 encodable/u);
  assert.throws(() => writeZip([{ name: "a".repeat(0xffff), data: Buffer.alloc(0) }]), /name length exceeds ZIP's 16-bit limit/u);
  assert.throws(() => writeZip(Array.from({ length: 0xffff }, () => ({ name: "", data: Buffer.alloc(0) }))), /entry count exceeds ZIP's 16-bit limit/u);
});
