function normalizeBasePath(value) {
  if (!value) return ""

  const trimmed = value.trim()
  if (!trimmed || trimmed === "/") return ""

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, "")
}

export const basePath = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || ""
)

export function withBasePath(path) {
  if (!path) return basePath || "/"
  if (/^https?:\/\//.test(path)) return path

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${basePath}${normalizedPath}` || "/"
}
