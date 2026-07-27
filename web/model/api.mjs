export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

export class CampusWeaveApiError extends Error {
  constructor(status, payload) {
    const code = payload?.code || payload?.error || 'request_failed'
    const messages = {
      invalid_request: 'The local compiler rejected this profile.',
      planner_unavailable: 'The local planner could not produce a safe plan.',
      reference_unavailable: 'The checked-in university profile is unavailable.',
      invalid_request_origin: 'CampusWeave refused a non-loopback request.',
    }
    super(payload?.message || messages[code] || `CampusWeave request failed (${status})`)
    this.name = 'CampusWeaveApiError'
    this.status = status
    this.code = code
    this.path = payload?.path || 'request'
    this.details = Array.isArray(payload?.details)
      ? payload.details.slice(0, 16).map((detail) => {
        if (!detail || typeof detail !== 'object') return 'Request: invalid value'
        const path = typeof detail.path === 'string' ? detail.path : '$'
        const message = typeof detail.message === 'string'
          ? detail.message
          : 'value does not satisfy the contract'
        return `${path}: ${message}`
      })
      : []
  }
}

async function responseJson(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = { message: `CampusWeave returned an invalid response (${response.status})` }
  }
  if (!response.ok) throw new CampusWeaveApiError(response.status, payload)
  return payload
}

async function request(path, options = {}) {
  const response = await fetch(`/api/v1/${path}`, {
    cache: 'no-store',
    credentials: 'omit',
    ...options,
  })
  return responseJson(response)
}

export const campusWeaveApi = {
  reference(signal) {
    return request('reference', { signal })
  },

  compile(profile, signal) {
    return request('compile-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile }),
      signal,
    })
  },

  importProfile(source, signal) {
    return request('import-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: source,
      signal,
    })
  },

  instantiate(profile, institutionCode, institutionLabel, signal) {
    return request('instantiate-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile,
        institution_code: institutionCode,
        institution_label: institutionLabel,
      }),
      signal,
    })
  },
}
