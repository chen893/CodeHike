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

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as Partial<ClientApiErrorResponse>;
    return typeof payload.message === 'string' ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, fallback));
  }

  return (await response.json()) as T;
}

export async function createDraftRequest(input: {
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
}) {
  const response = await fetch(withBasePath('/api/drafts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    throw new Error(await readApiErrorMessage(response, '删除草稿失败'));
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
    throw new Error(await readApiErrorMessage(response, '取消发布失败'));
  }
}

export async function startDraftGenerationStream(draftId: string, signal: AbortSignal) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/generate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationVersion: 'v2' }),
    signal,
  });

  if (!response.ok || !response.body) {
    const fallback = `请求失败，状态码 ${response.status}`;
    throw new Error(await readApiErrorMessage(response, fallback));
  }

  return response.body;
}
