'use client';

import { withBasePath } from '@/lib/base-path';
import type { SourceItem, TeachingBrief } from '@/lib/schemas';
import type {
  ClientDraftRecord,
  ClientApiErrorResponse,
  CreateDraftResponse,
  PublishDraftResponse,
} from '@/lib/types/client';

type ClientDraftStep = NonNullable<NonNullable<ClientDraftRecord['tutorialDraft']>['steps']>[number];

/**
 * Error thrown by draft-client API calls. Carries the structured `code`
 * and `recoverability` fields from the API response so callers can make
 * code-driven (not message-based) recovery decisions.
 */
export class DraftClientError extends Error {
  public readonly code: string;
  public readonly recoverability: 'none' | 'retry_full' | 'retry_from_step';

  constructor(
    message: string,
    code: string,
    recoverability: 'none' | 'retry_full' | 'retry_from_step' = 'retry_full',
  ) {
    super(message);
    this.name = 'DraftClientError';
    this.code = code;
    this.recoverability = recoverability;
  }
}

type Recoverability = 'none' | 'retry_full' | 'retry_from_step';

const VALID_RECOVERABILITY = new Set<string>(['none', 'retry_full', 'retry_from_step']);

async function readApiErrorPayload(response: Response, fallback: string): Promise<{ message: string; code: string; recoverability: Recoverability }> {
  try {
    const payload = (await response.json()) as Partial<ClientApiErrorResponse> & {
      recoverability?: string;
    };
    const message = typeof payload.message === 'string' ? payload.message : fallback;
    const code = typeof payload.code === 'string' ? payload.code : 'UNKNOWN';
    const raw = payload.recoverability;
    const recoverability: Recoverability = raw && VALID_RECOVERABILITY.has(raw)
      ? (raw as Recoverability)
      : 'retry_full';
    return { message, code, recoverability };
  } catch {
    return { message: fallback, code: 'UNKNOWN', recoverability: 'retry_full' };
  }
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const { message, code, recoverability } = await readApiErrorPayload(response, fallback);
    throw new DraftClientError(message, code, recoverability);
  }

  return (await response.json()) as T;
}

export async function createDraftRequest(input: {
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
}, options?: { idempotencyKey?: string }) {
  const response = await fetch(withBasePath('/api/drafts'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : {}),
    },
    body: JSON.stringify(input),
  });

  return readJsonResponse<CreateDraftResponse>(response, '创建失败');
}

export async function fetchDraft(draftId: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}`));
  return readJsonResponse<ClientDraftRecord>(response, '获取最新草稿失败');
}

export async function updateDraftRequest(draftId: string, data: unknown) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return readJsonResponse<ClientDraftRecord>(response, '保存元信息失败');
}

export async function appendDraftStepRequest(draftId: string, step: ClientDraftStep) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/steps`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
  });

  return readJsonResponse<ClientDraftRecord>(response, '追加步骤失败');
}

export async function updateDraftStepRequest(
  draftId: string,
  stepId: string,
  data: unknown
) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/steps/${stepId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return readJsonResponse<ClientDraftRecord>(response, '保存步骤失败');
}

export async function regenerateDraftStepRequest(
  draftId: string,
  stepId: string,
  input: { mode: 'prose' | 'step'; instruction?: string }
) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/steps/${stepId}/regenerate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return readJsonResponse<ClientDraftRecord>(response, '重新生成失败');
}

export async function replaceDraftStepsRequest(draftId: string, stepIds: string[]) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/steps`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stepIds }),
  });

  return readJsonResponse<ClientDraftRecord>(response, '更新步骤顺序失败');
}

export async function deleteDraftStepRequest(draftId: string, stepId: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/steps/${stepId}`), {
    method: 'DELETE',
  });

  return readJsonResponse<ClientDraftRecord>(response, '删除步骤失败');
}

export async function deleteDraftRequest(draftId: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}`), {
    method: 'DELETE',
  });

  if (!response.ok) {
    const { message, code, recoverability } = await readApiErrorPayload(response, '删除草稿失败');
    throw new DraftClientError(message, code, recoverability);
  }
}

export async function publishDraftRequest(draftId: string, slug?: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/publish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: slug || undefined }),
  });

  return readJsonResponse<PublishDraftResponse>(response, '发布失败');
}

export async function unpublishDraftRequest(draftId: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/unpublish`), {
    method: 'POST',
  });

  if (!response.ok) {
    const { message, code, recoverability } = await readApiErrorPayload(response, '取消发布失败');
    throw new DraftClientError(message, code, recoverability);
  }
}

export async function updateDraftStructureRequest(
  draftId: string,
  data: {
    chapters: Array<{ id: string; title: string; description?: string; order: number }>;
    stepOrder: Array<{ stepId: string; chapterId: string }>;
  }
) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/structure`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return readJsonResponse<ClientDraftRecord>(response, '更新章节结构失败');
}

export async function addChapterRequest(
  draftId: string,
  data?: { title?: string; description?: string }
) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/chapters`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });

  return readJsonResponse<ClientDraftRecord>(response, '添加章节失败');
}

export async function updateChapterRequest(
  draftId: string,
  chapterId: string,
  data: { title?: string; description?: string }
) {
  const response = await fetch(
    withBasePath(`/api/drafts/${draftId}/chapters/${chapterId}`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );

  return readJsonResponse<ClientDraftRecord>(response, '更新章节失败');
}

export async function deleteChapterRequest(
  draftId: string,
  chapterId: string,
  moveStepsToChapterId: string
) {
  const response = await fetch(
    withBasePath(`/api/drafts/${draftId}/chapters/${chapterId}`),
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveStepsToChapterId }),
    }
  );

  return readJsonResponse<ClientDraftRecord>(response, '删除章节失败');
}

export async function startDraftGenerationStream(draftId: string, signal: AbortSignal, modelId?: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/generate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId }),
    signal,
  });

  if (!response.ok || !response.body) {
    const fallback = `请求失败，状态码 ${response.status}`;
    const { message, code, recoverability } = await readApiErrorPayload(response, fallback);
    throw new DraftClientError(message, code, recoverability);
  }

  return response.body;
}

export async function cancelDraftGeneration(draftId: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/cancel`), {
    method: 'POST',
  });

  if (!response.ok) {
    const { message, code, recoverability } = await readApiErrorPayload(response, '取消生成失败');
    throw new DraftClientError(message, code, recoverability);
  }
}

export type { Recoverability };

export interface GenerationJobStatus {
  id: string;
  status: string;
  phase: string | null;
  currentStepIndex: number | null;
  totalSteps: number | null;
  modelId: string | null;
  cancelRequested: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  recoverability: Recoverability;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  outlineSnapshot: {
    meta: { title: string; description: string };
    steps: Array<{
      id: string;
      title: string;
      teachingGoal: string;
      conceptIntroduced: string;
      estimatedLocChange: number;
    }>;
  } | null;
  stepTitlesSnapshot: string[] | null;
}

export interface GenerationStatusResponse {
  job: GenerationJobStatus | null;
}

export async function fetchGenerationStatus(draftId: string, lightweight?: boolean) {
  const query = lightweight ? '?lightweight=true' : '';
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/generation-status${query}`));

  return readJsonResponse<GenerationStatusResponse>(response, '获取生成状态失败');
}
