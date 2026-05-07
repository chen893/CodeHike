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
import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentRunLogger {
  runId: string | null;
  logFilePath: string | null;
  logEvent(type: string, data: Record<string, unknown>): void;
}

export interface AgentRunLoggerMetadata {
  runId?: string;
  jobId?: string;
  draftId?: string;
  modelId?: string;
}

const NOOP_LOGGER: AgentRunLogger = {
  runId: null,
  logFilePath: null,
  logEvent() {},
};

let lastLogFilePath: string | null = null;

function ensureLogDir(): string {
  const dir = process.env.AGENT_LOOP_LOG_DIR || join(homedir(), '.codehike-debug');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64) || 'run';
}

function createFileLogger(metadata: AgentRunLoggerMetadata = {}): AgentRunLogger {
  const dir = ensureLogDir();
  const now = new Date();
  const runId = metadata.runId ?? randomUUID();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffixBase = metadata.jobId ? safeFilePart(metadata.jobId) : safeFilePart(runId);
  const suffix = `${suffixBase}-${safeFilePart(runId).slice(0, 8)}`;
  const logFilePath = join(dir, `agent-run-${ts}-${suffix}.log`);
  let entryIndex = 0;
  lastLogFilePath = logFilePath;

  const header = {
    _header: true,
    timestamp: now.toISOString(),
    runId,
    jobId: metadata.jobId ?? null,
    draftId: metadata.draftId ?? null,
    modelId: metadata.modelId ?? null,
    pid: process.pid,
  };
  appendFileSync(logFilePath, JSON.stringify(header) + '\n');

  return {
    runId,
    logFilePath,
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

export function createAgentRunLogger(
  metadata: AgentRunLoggerMetadata = {},
): AgentRunLogger {
  if (process.env.AGENT_LOOP_DEBUG !== '1') {
    return NOOP_LOGGER;
  }
  return createFileLogger(metadata);
}

export function getLogFilePath(): string | null {
  return lastLogFilePath;
}
