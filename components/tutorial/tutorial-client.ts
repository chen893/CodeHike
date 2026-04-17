'use client';

import { withBasePath } from '@/lib/base-path';
import type { ClientTutorialPayload } from '@/lib/types/client';

export class TutorialClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'TutorialClientError';
    this.code = code;
    this.status = status;
  }
}

async function readTutorialError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as Partial<{
      message: string;
      code: string;
    }>;
    return {
      message: typeof payload.message === 'string' ? payload.message : fallback,
      code: typeof payload.code === 'string' ? payload.code : 'UNKNOWN',
    };
  } catch {
    return { message: fallback, code: 'UNKNOWN' };
  }
}

async function readTutorialResponse(response: Response) {
  if (!response.ok) {
    const fallback = `请求失败，状态码 ${response.status}`;
    const { message, code } = await readTutorialError(response, fallback);
    throw new TutorialClientError(message, code, response.status);
  }

  return (await response.json()) as ClientTutorialPayload;
}

export async function fetchTutorialPayloadBySlug(slug: string) {
  const response = await fetch(withBasePath(`/api/tutorials/${slug}`));
  return readTutorialResponse(response);
}

export async function fetchTutorialPreviewPayload(fetchUrl: string) {
  const response = await fetch(withBasePath(fetchUrl));
  return readTutorialResponse(response);
}

export async function fetchDraftPreviewPayload(draftId: string) {
  const response = await fetch(withBasePath(`/api/drafts/${draftId}/payload`), {
    cache: 'no-store',
  });
  return readTutorialResponse(response);
}
