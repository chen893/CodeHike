import { cache } from 'react';
import * as publishedRepo from '../repositories/published-tutorial-repository';
import type { PublishedTutorial } from '../types/api';
import { buildTutorialPayload } from '../tutorial/payload';
import { buildTutorialSteps } from '../tutorial/assembler';
import {
  getTutorialBySlug,
  listTutorials,
  tutorialSlugs,
} from '../tutorial/registry';

const loadTutorialSourceBySlug = cache(async (slug: string) => {
  try {
    const published = await publishedRepo.getPublishedBySlug(slug);
    if (published) {
      return {
        source: 'published' as const,
        tutorial: published.tutorialDraftSnapshot,
      };
    }
  } catch (err) {
    console.error('加载已发布教程失败:', err);
  }

  const tutorial = getTutorialBySlug(slug);
  if (!tutorial) {
    return null;
  }

  return {
    source: 'registry' as const,
    tutorial,
  };
});

export function listStaticTutorialParams() {
  return tutorialSlugs.map((slug) => ({ slug }));
}

export async function getTutorialMetadata(slug: string) {
  const record = await loadTutorialSourceBySlug(slug);
  if (!record) {
    return null;
  }

  return {
    source: record.source,
    title: record.tutorial.meta.title,
    description: record.tutorial.meta.description,
  };
}

export async function getTutorialPageData(slug: string) {
  const record = await loadTutorialSourceBySlug(slug);
  if (!record) {
    return null;
  }

  const steps = await buildTutorialSteps(record.tutorial);

  return {
    source: record.source,
    steps,
    title: record.tutorial.meta.title,
    description: record.tutorial.meta.description,
    fileName: record.tutorial.meta.fileName,
    intro: record.tutorial.intro.paragraphs,
  };
}

export async function getRemoteTutorialPageData(slug: string) {
  const metadata = await getTutorialMetadata(slug);
  if (!metadata) {
    return null;
  }

  return {
    slug,
    title: metadata.title,
    description: metadata.description,
  };
}

export async function getTutorialPayloadData(slug: string) {
  const record = await loadTutorialSourceBySlug(slug);
  if (!record) {
    return null;
  }

  const payload = await buildTutorialPayload(record.tutorial);

  return {
    source: record.source,
    payload,
  };
}

export async function getHomePageData() {
  let publishedTutorials: PublishedTutorial[] = [];
  try {
    publishedTutorials = await publishedRepo.listPublished();
  } catch (err) {
    console.error('加载已发布教程列表失败:', err);
  }

  return {
    publishedTutorials,
    tutorials: listTutorials(),
  };
}
