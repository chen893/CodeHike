function normalizeBasePath(value) {
  if (!value) return ""

  const trimmed = value.trim()
  if (!trimmed || trimmed === "/") return ""

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, "")
}

const nextConfig = {
  reactStrictMode: true,
  basePath: normalizeBasePath(
    process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || ""
  ),
}

export default nextConfig
