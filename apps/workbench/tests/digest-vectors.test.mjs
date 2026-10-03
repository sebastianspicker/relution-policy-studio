import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadWorkbenchModules} from './support/vite-loader.mjs';
// api.ts imports policy-engine browser code; its digest() must match the golden Python-generated vectors.
const [{digest}] = await loadWorkbenchModules('/src/api.ts');
const fixtures = new URL('../../../contracts/fixtures/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, fixtures), 'utf8'));
const {vectors} = await read('canonical-json-vectors.json');
for (const vector of vectors) {
  test(`workbench digest() matches the golden vector ${vector.name}`, async () => {
    const input = vector.input_file === undefined ? vector.input : await read(vector.input_file);
    assert.equal(await digest(input), vector.sha256);
  });
}
