import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatDevOrigin,
  getAuthCookieOverrides,
  getDefaultDevServerOptions,
  getDevInstanceName,
  normalizeInstanceName,
} from '../lib/dev-instance.mjs'

test('normalizeInstanceName converts cwd-style names into cookie-safe ids', () => {
  assert.equal(normalizeInstanceName('CodeHike revamp_copy'), 'codehike-revamp-copy')
  assert.equal(normalizeInstanceName(''), '')
})

test('getDevInstanceName auto-derives a namespace from cwd in development', () => {
  assert.equal(
    getDevInstanceName({
      env: {},
      cwd: '/tmp/CodeHike-revamp',
      nodeEnv: 'development',
    }),
    'codehike-revamp'
  )
})

test('getDevInstanceName only auto-scopes cookies in development', () => {
  assert.equal(
    getDevInstanceName({
      env: {},
      cwd: '/tmp/CodeHike-revamp',
      nodeEnv: 'production',
    }),
    ''
  )
})

test('explicit VIBEDOCS_INSTANCE_NAME overrides cwd-derived namespace', () => {
  assert.equal(
    getDevInstanceName({
      env: { VIBEDOCS_INSTANCE_NAME: 'homepage-lab' },
      cwd: '/tmp/CodeHike-revamp',
      nodeEnv: 'development',
    }),
    'homepage-lab'
  )
})

test('getAuthCookieOverrides scopes all auth cookies with the local instance name', () => {
  const cookies = getAuthCookieOverrides({
    env: {},
    cwd: '/tmp/CodeHike-revamp',
    nodeEnv: 'development',
    origin: 'http://localhost:3001',
  })

  assert.ok(cookies)
  assert.equal(cookies.sessionToken.name, 'codehike-revamp.authjs.session-token')
  assert.equal(cookies.csrfToken.name, 'codehike-revamp.authjs.csrf-token')
  assert.equal(cookies.state.name, 'codehike-revamp.authjs.state')
})

test('getAuthCookieOverrides keeps secure prefixes for https origins', () => {
  const cookies = getAuthCookieOverrides({
    env: { VIBEDOCS_INSTANCE_NAME: 'review-sandbox' },
    nodeEnv: 'development',
    origin: 'https://review.example.com',
  })

  assert.ok(cookies)
  assert.equal(
    cookies.sessionToken.name,
    '__Secure-review-sandbox.authjs.session-token'
  )
  assert.equal(
    cookies.csrfToken.name,
    '__Host-review-sandbox.authjs.csrf-token'
  )
})

test('getDefaultDevServerOptions defaults this repo to localhost:3001', () => {
  assert.deepEqual(getDefaultDevServerOptions({ env: {} }), {
    host: 'localhost',
    port: '3001',
  })
})

test('formatDevOrigin builds a stable local auth origin from host and port', () => {
  assert.equal(formatDevOrigin('localhost', '3001'), 'http://localhost:3001')
  assert.equal(formatDevOrigin('::1', '3001'), 'http://[::1]:3001')
})
