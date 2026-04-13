'use client';

import { withBasePath } from '@/lib/base-path.js';
import type { ClientApiErrorResponse } from '@/lib/types/client';

export interface UserProfileData {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  bio: string | null;
}

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as Partial<ClientApiErrorResponse>;
    return typeof payload.message === 'string' ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

function assertOk(response: Response, fallback: string): void {
  if (!response.ok) {
    throw new Error(`${fallback} (HTTP ${response.status})`);
  }
}

export async function fetchProfile(): Promise<UserProfileData> {
  const response = await fetch(withBasePath('/api/user/profile'));
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, '获取个人资料失败'));
  }
  return (await response.json()) as UserProfileData;
}

export async function updateProfile(data: {
  name?: string;
  bio?: string;
}): Promise<void> {
  const response = await fetch(withBasePath('/api/user/profile'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  assertOk(response, await readApiErrorMessage(response, '更新个人资料失败'));
}

export async function setUsername(username: string): Promise<void> {
  const response = await fetch(withBasePath('/api/user/username'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  assertOk(response, await readApiErrorMessage(response, '设置用户名失败'));
}
