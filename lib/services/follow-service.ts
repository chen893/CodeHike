import * as followRepo from '../repositories/follow-repository';
import * as tagRepo from '../repositories/tag-repository';
import type { TutorialTag } from '../types/api';

export async function followTagBySlug(userId: string, tagSlug: string): Promise<void> {
  const tag = await tagRepo.getTagBySlug(tagSlug);
  if (!tag) throw new Error('Tag not found');
  await followRepo.followTag(userId, tag.id);
}

export async function unfollowTagBySlug(userId: string, tagSlug: string): Promise<void> {
  const tag = await tagRepo.getTagBySlug(tagSlug);
  if (!tag) throw new Error('Tag not found');
  await followRepo.unfollowTag(userId, tag.id);
}

export async function checkFollowStatus(userId: string, tagSlug: string): Promise<boolean> {
  const tag = await tagRepo.getTagBySlug(tagSlug);
  if (!tag) return false;
  return followRepo.isFollowingTag(userId, tag.id);
}

export async function followTagById(userId: string, tagId: string): Promise<void> {
  await followRepo.followTag(userId, tagId);
}

export async function unfollowTagById(userId: string, tagId: string): Promise<void> {
  await followRepo.unfollowTag(userId, tagId);
}

export async function isFollowingById(userId: string, tagId: string): Promise<boolean> {
  return followRepo.isFollowingTag(userId, tagId);
}

export async function getFollowedTags(userId: string): Promise<TutorialTag[]> {
  return followRepo.getFollowedTags(userId);
}

export async function getFollowedTutorials(userId: string) {
  return followRepo.getFollowedTutorials(userId);
}
