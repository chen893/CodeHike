import * as userRepo from '../repositories/user-repository';
import { isReservedSlug } from '../utils/slug';
import type { UserPublicProfile, PublishedTutorial } from '../types/api';

export async function getPublicProfile(
  username: string,
): Promise<UserPublicProfile | null> {
  return userRepo.getUserByUsername(username);
}

export async function setUsername(
  userId: string,
  username: string,
): Promise<void> {
  // Validate: 3-64 chars, alphanumeric + hyphens
  if (username.length < 3 || username.length > 64) {
    throw new Error('Username must be between 3 and 64 characters');
  }
  if (!/^[a-zA-Z0-9-]+$/.test(username)) {
    throw new Error('Username can only contain letters, numbers, and hyphens');
  }
  if (/^\d+$/.test(username)) {
    throw new Error('Username cannot be all numbers');
  }
  if (isReservedSlug(username)) {
    throw new Error('This username is reserved');
  }

  await userRepo.setUsername(userId, username);
}

export async function updateProfile(
  userId: string,
  data: { name?: string; bio?: string; image?: string },
): Promise<void> {
  // Only pass fields the repository supports (name and bio; image is on users table too)
  const repoData: { name?: string; bio?: string } = {};
  if (data.name !== undefined) repoData.name = data.name;
  if (data.bio !== undefined) repoData.bio = data.bio;
  await userRepo.updateProfile(userId, repoData);
}

export async function getProfileTutorialData(
  username: string,
): Promise<PublishedTutorial[]> {
  const profile = await userRepo.getUserByUsername(username);
  if (!profile) {
    return [];
  }
  return userRepo.getPublishedTutorialsByUser(profile.id);
}
