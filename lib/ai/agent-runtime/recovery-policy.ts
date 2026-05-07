import type { AgentFailureCategory } from './types';

const UNRECOVERABLE_PATTERNS = [
  '目标文件',
  'does not exist',
  '不在当前文件集',
  'placeholder target file',
];

const PROVIDER_PATTERNS = [
  'terminated',
  'other side closed',
  'rate limit',
  '429',
  'timeout',
];

export function classifyFailureMessage(message: string | null | undefined): AgentFailureCategory {
  if (!message) return 'unknown';

  if (UNRECOVERABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return 'unrecoverable';
  }

  if (PROVIDER_PATTERNS.some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()))) {
    return 'provider';
  }

  if (
    message.includes('Patch 匹配失败') ||
    message.includes('Patch 匹配歧义') ||
    message.includes('找不到') ||
    message.includes('匹配')
  ) {
    return 'repairable';
  }

  return 'validation';
}

export function shouldRetryRepair(params: {
  attempt: number;
  maxRepairsPerStep: number;
  category: AgentFailureCategory;
}) {
  if (params.category === 'unrecoverable') return false;
  if (params.category === 'provider') return false;
  return params.attempt + 1 < params.maxRepairsPerStep;
}

export function shouldReviseTail(params: {
  consecutiveRepairFailures: number;
  replanCount: number;
  maxReplans: number;
  immediate?: boolean;
}) {
  if (params.replanCount >= params.maxReplans) return false;
  if (params.immediate) return true;
  return params.consecutiveRepairFailures >= 2;
}

export function shouldCompress(params: {
  used: number;
  budget: number;
}) {
  if (params.budget <= 0) return null;
  const usageRatio = params.used / params.budget;
  if (usageRatio >= 0.85) return 'replan' as const;
  if (usageRatio >= 0.65) return 'summary' as const;
  return null;
}

export function shouldAbortRun(params: {
  cancelled?: boolean;
  currentTurnCount?: number;
  maxTurns?: number;
  category?: AgentFailureCategory | null;
}) {
  if (params.cancelled) return true;
  if (
    typeof params.currentTurnCount === 'number' &&
    typeof params.maxTurns === 'number' &&
    params.currentTurnCount > params.maxTurns
  ) {
    return true;
  }
  return params.category === 'provider';
}

export function shouldAcceptDegradedStep() {
  return false;
}
