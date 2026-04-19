import { spawn } from 'node:child_process'
import path from 'node:path'

import {
  formatDevOrigin,
  getDefaultDevServerOptions,
} from '../lib/dev-instance.mjs'

function readFlagValue(args, flags) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const matchingFlag = flags.find((flag) => arg === flag || arg.startsWith(`${flag}=`))

    if (!matchingFlag) {
      continue
    }

    if (arg.startsWith(`${matchingFlag}=`)) {
      return arg.slice(matchingFlag.length + 1)
    }

    return args[index + 1]
  }

  return undefined
}

function hasFlag(args, flags) {
  return flags.some((flag) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`)))
}

const extraArgs = process.argv.slice(2)
const defaults = getDefaultDevServerOptions()
const port = readFlagValue(extraArgs, ['--port', '-p']) || defaults.port
const hostname = readFlagValue(extraArgs, ['--hostname', '-H']) || defaults.host

const nextArgs = ['dev', '--webpack']

if (!hasFlag(extraArgs, ['--port', '-p'])) {
  nextArgs.push('--port', port)
}

if (!hasFlag(extraArgs, ['--hostname', '-H'])) {
  nextArgs.push('--hostname', hostname)
}

nextArgs.push(...extraArgs)

const env = {
  ...process.env,
}

if (!env.AUTH_URL && !env.NEXTAUTH_URL) {
  const origin = formatDevOrigin(hostname, port)
  env.AUTH_URL = origin
  env.NEXTAUTH_URL = origin
}

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
