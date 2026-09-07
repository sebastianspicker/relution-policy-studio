import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalJson, safeFilename } from '../../web/model.mjs'
import { escapeHtml, icon } from '../../web/views.mjs'

test('serialization produces deterministic JSON and safe export filenames', () => {
  assert.equal(canonicalJson({ z: [2, { b: 1, a: true }], a: 'value' }),
    '{"a":"value","z":[2,{"a":true,"b":1}]}\n')
  assert.equal(safeFilename(' Example University / 2026 '), 'example-university-2026')
  assert.equal(safeFilename('***'), 'university')
  assert.equal(safeFilename('x'.repeat(100)).length, 64)
})

test('HTML rendering escapes untrusted display values and fixed icons escape classes', () => {
  assert.equal(escapeHtml(`<tag attr="x">&'`), '&lt;tag attr=&quot;x&quot;&gt;&amp;&#039;')
  assert.match(icon('missing', 'x" onclick="bad'), /class="icon x&quot; onclick=&quot;bad"/)
  assert.match(icon('missing'), /<svg/)
})
