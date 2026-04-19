import path from 'node:path'

const DEFAULT_DEV_HOST = 'localhost'
const DEFAULT_DEV_PORT = '3001'
const DEFAULT_INSTANCE_NAME = 'vibedocs-local'

export function normalizeInstanceName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function getDevInstanceName({
  env = process.env,
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const explicitName = normalizeInstanceName(env.VIBEDOCS_INSTANCE_NAME)
  if (explicitName) {
    return explicitName
  }

  if (nodeEnv !== 'development') {
    return ''
  }

  return normalizeInstanceName(path.basename(cwd)) || DEFAULT_INSTANCE_NAME
}

export function isSecureOrigin(url) {
  if (!url) {
    return false
  }

  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function buildCookieName(baseName, namespace, secure, { hostPrefix = false } = {}) {
  const prefix = hostPrefix ? (secure ? '__Host-' : '') : (secure ? '__Secure-' : '')
  return `${prefix}${namespace}.${baseName}`
}

export function getAuthCookieOverrides({
  env = process.env,
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV,
  origin = env.AUTH_URL ?? env.NEXTAUTH_URL,
} = {}) {
  const namespace = getDevInstanceName({ env, cwd, nodeEnv })
  if (!namespace) {
    return undefined
  }

  const secure = isSecureOrigin(origin)

  return {
    sessionToken: {
      name: buildCookieName('authjs.session-token', namespace, secure),
    },
    callbackUrl: {
      name: buildCookieName('authjs.callback-url', namespace, secure),
    },
    csrfToken: {
      name: buildCookieName('authjs.csrf-token', namespace, secure, {
        hostPrefix: true,
      }),
    },
    pkceCodeVerifier: {
      name: buildCookieName('authjs.pkce.code_verifier', namespace, secure),
    },
    state: {
      name: buildCookieName('authjs.state', namespace, secure),
    },
    nonce: {
      name: buildCookieName('authjs.nonce', namespace, secure),
    },
    webauthnChallenge: {
      name: buildCookieName('authjs.challenge', namespace, secure),
    },
  }
}

export function getDefaultDevServerOptions({ env = process.env } = {}) {
  return {
    host: env.VIBEDOCS_DEV_HOST?.trim() || DEFAULT_DEV_HOST,
    port: env.VIBEDOCS_DEV_PORT?.trim() || DEFAULT_DEV_PORT,
  }
}

export function formatDevOrigin(host, port) {
  const normalizedHost = host?.includes(':') && !host.startsWith('[')
    ? `[${host}]`
    : host

  return `http://${normalizedHost}:${port}`
}
