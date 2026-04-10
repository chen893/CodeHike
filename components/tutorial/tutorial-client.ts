'use client';

import { withBasePath } from '@/lib/base-path';
import type { ClientTutorialPayload } from '@/lib/types/client';

async function readTutorialResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`请求失败，状态码 ${response.status}`);
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
