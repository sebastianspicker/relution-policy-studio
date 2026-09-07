const PROFILE_STORAGE_KEY = ['campusweave', 'v1', 'profile'].join(':')
const MAX_STORED_BYTES = 2 * 1024 * 1024

export function loadStoredProfile() {
  try {
    const source = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!source || source.length > MAX_STORED_BYTES) return undefined
    const parsed = JSON.parse(source)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

export function storeValidatedProfile(profile) {
  const source = JSON.stringify(profile)
  if (source.length > MAX_STORED_BYTES) {
    throw new Error('Validated profile exceeds the browser-local storage limit.')
  }
  localStorage.setItem(PROFILE_STORAGE_KEY, source)
}

export function clearStoredProfile() {
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY)
  } catch {
    // Storage is optional; the authoritative in-memory result remains usable.
  }
}
