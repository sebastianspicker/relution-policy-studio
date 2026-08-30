import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CampusWeaveApiError,
  campusWeaveApi,
  clearStoredProfile,
  loadStoredProfile,
  storeValidatedProfile,
} from '../../web/model.mjs'

function storageWith(values = {}) {
  const store = new Map(Object.entries(values))
  return {
    getItem(key) {
      return store.get(key) ?? null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('storage ignores unavailable or malformed browser data and retains valid profiles', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storageWith(),
      writable: true,
    })
    storeValidatedProfile({ package: { institution_code: 'example-u' } })
    assert.deepEqual(loadStoredProfile(), { package: { institution_code: 'example-u' } })

    globalThis.localStorage = { getItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    assert.equal(loadStoredProfile(), undefined)
    assert.doesNotThrow(() => clearStoredProfile())
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('API errors are normalized and import requests preserve the source document', async () => {
  const originalFetch = globalThis.fetch
  try {
    let request
    globalThis.fetch = async (path, options) => {
      request = { path, options }
      return {
        ok: false,
        status: 400,
        async json() {
          return {
            error: 'invalid_request',
            details: Array.from({ length: 20 }, (_, index) => ({ path: `$.field${index}`, message: 'invalid' })),
          }
        },
      }
    }
    await assert.rejects(
      campusWeaveApi.importProfile('{"profile":true}'),
      (error) => {
        assert.ok(error instanceof CampusWeaveApiError)
        assert.equal(error.status, 400)
        assert.equal(error.code, 'invalid_request')
        assert.equal(error.details.length, 16)
        return true
      },
    )
    assert.equal(request.path, '/api/v1/import-profile')
    assert.equal(request.options.body, '{"profile":true}')
    assert.equal(request.options.headers['content-type'], 'application/json')
    assert.equal(request.options.cache, 'no-store')
    assert.equal(request.options.credentials, 'omit')
  } finally {
    globalThis.fetch = originalFetch
  }
})
