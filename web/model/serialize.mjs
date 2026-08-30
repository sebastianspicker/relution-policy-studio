export function safeFilename(value) {
  const normalized = String(value || 'university')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return normalized || 'university'
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]))
  }
  return value
}

export function downloadJson(filename, value) {
  const payload = `${JSON.stringify(sortJson(value))}\n`
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value))}\n`
}
