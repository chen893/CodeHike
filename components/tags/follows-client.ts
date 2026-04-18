'use client';

/**
 * Feature client for tag follow/unfollow API calls.
 * The follow API endpoint ships in Plan 06 — until then, calls will 404 (intentional phased design).
 */

import { withBasePath } from '@/lib/base-path.js';

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as Partial<{ message: string }>;
    return typeof payload.message === 'string' ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

export async function followTag(tagId: string): Promise<void> {
  const response = await fetch(withBasePath(`/api/tags/${tagId}/follow`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, '\u5173\u6ce8\u6807\u7b7e\u5931\u8d25'));
  }
}

export async function unfollowTag(tagId: string): Promise<void> {
  const response = await fetch(withBasePath(`/api/tags/${tagId}/follow`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, '\u53d6\u6d88\u5173\u6ce8\u5931\u8d25'));
  }
}

export async function checkFollowStatus(tagId: string): Promise<boolean> {
  const response = await fetch(withBasePath(`/api/tags/${tagId}/follow`));
  if (!response.ok) return false;
  const data = (await response.json()) as { following: boolean };
  return data.following;
}
