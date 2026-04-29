export const DEV_BYPASS_COOKIE_NAME = 'vibedocs-dev-user-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeHost(hostHeader: string | null | undefined) {
  const raw = String(hostHeader ?? '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);

  if (!raw) {
    return '';
  }

  if (raw.startsWith('[')) {
    const closingIndex = raw.indexOf(']');
    if (closingIndex >= 0) {
      return raw.slice(1, closingIndex).toLowerCase();
    }
  }

  const [hostname] = raw.split(':');
  return hostname.trim().toLowerCase();
}

export function isValidDevBypassUserId(value: string | null | undefined) {
  return UUID_RE.test(String(value ?? ''));
}

export function isLoopbackHost(hostHeader: string | null | undefined) {
  const hostname = normalizeHost(hostHeader);
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

export function canUseDevAuthBypass(params: {
  userId: string | null | undefined;
  hostHeader: string | null | undefined;
  nodeEnv?: string | null | undefined;
}) {
  const {
    userId,
    hostHeader,
    nodeEnv = process.env.NODE_ENV,
  } = params;

  return (
    nodeEnv === 'development' &&
    isValidDevBypassUserId(userId) &&
    isLoopbackHost(hostHeader)
  );
}

export function readDevBypassUserIdFromCookieHeader(
  cookieHeader: string | null | undefined
) {
  const prefix = `${DEV_BYPASS_COOKIE_NAME}=`;

  for (const part of String(cookieHeader ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) {
      continue;
    }

    const rawValue = trimmed.slice(prefix.length);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}
