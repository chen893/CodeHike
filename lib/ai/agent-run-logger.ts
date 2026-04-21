/**
 * Per-run structured logger for the agent loop.
 *
 * Inspired by mini-agent-typescript's AgentLogger pattern.
 * Activates only when AGENT_LOOP_DEBUG=1 is set — otherwise returns a no-op.
 *
 * Log files written to ~/.codehike-debug/agent-run-YYYYMMDD-HHmmss.log
 * Each entry is a timestamped JSON line with a sequential index.
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentRunLogger {
  logEvent(type: string, data: Record<string, unknown>): void;
}

const NOOP_LOGGER: AgentRunLogger = {
  logEvent() {},
};

let logFilePath: string | null = null;
let entryIndex = 0;

function ensureLogDir(): string {
  const dir = join(homedir(), '.codehike-debug');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function createFileLogger(): AgentRunLogger {
  const dir = ensureLogDir();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  logFilePath = join(dir, `agent-run-${ts}.log`);

  const header = {
    _header: true,
    timestamp: now.toISOString(),
    pid: process.pid,
  };
  appendFileSync(logFilePath, JSON.stringify(header) + '\n');

  return {
    logEvent(type: string, data: Record<string, unknown>) {
      entryIndex++;
      const entry = {
        _idx: entryIndex,
        _ts: new Date().toISOString(),
        _type: type,
        ...data,
      };
      try {
        appendFileSync(logFilePath!, JSON.stringify(entry) + '\n');
      } catch {
        // Log file write failure must never break generation
      }
    },
  };
}

export function createAgentRunLogger(): AgentRunLogger {
  if (process.env.AGENT_LOOP_DEBUG !== '1') {
    return NOOP_LOGGER;
  }
  return createFileLogger();
}

export function getLogFilePath(): string | null {
  return logFilePath;
}
