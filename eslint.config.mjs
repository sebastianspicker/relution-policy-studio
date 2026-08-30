const browserGlobals = {
  AbortController: 'readonly',
  Blob: 'readonly',
  DOMParser: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  clearTimeout: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
}

const rules = {
  'no-constant-binary-expression': 'error',
  'no-dupe-else-if': 'error',
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-useless-escape': 'error',
  'prefer-const': 'error',
}

export default [
  {
    files: ['web/**/*.mjs', 'web/app.js'],
    languageOptions: { globals: browserGlobals },
    rules,
  },
  {
    files: ['tests/web/**/*.mjs'],
    languageOptions: {
      globals: {
        URL: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules,
  },
]
