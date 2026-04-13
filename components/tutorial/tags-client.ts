'use client';

import { withBasePath } from '@/lib/base-path.js';
import type { TutorialTag } from '@/lib/types/api';

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as Partial<{ message: string }>;
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

export interface TagWithCount extends TutorialTag {
  tutorialCount: number;
}

/**
 * Fetch all tags with their tutorial counts.
 */
export async function fetchTags(): Promise<TagWithCount[]> {
  const response = await fetch(withBasePath('/api/tags'));
  return readJsonResponse<TagWithCount[]>(response, '获取标签失败');
}

/**
 * Update a tutorial's tags by providing an array of tag names.
 */
export async function updateTutorialTags(
  tutorialId: string,
  tagNames: string[],
): Promise<TutorialTag[]> {
  const response = await fetch(
    withBasePath(`/api/tutorials/${tutorialId}/tags`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: tagNames }),
    },
  );
  return readJsonResponse<TutorialTag[]>(response, '更新标签失败');
}

/**
 * Get tags for a specific tutorial.
 */
export async function fetchTutorialTags(
  tutorialId: string,
): Promise<TutorialTag[]> {
  const response = await fetch(
    withBasePath(`/api/tutorials/${tutorialId}/tags`),
  );
  return readJsonResponse<TutorialTag[]>(response, '获取教程标签失败');
}
