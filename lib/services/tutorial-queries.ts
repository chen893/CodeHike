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
import { estimateReadingTime } from '../utils/seo';
import { trackTutorialViewed } from '../monitoring/analytics';
import { deriveChapterSections, deriveStepChapterMeta, ensureDraftChapters } from '../tutorial/chapters';

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
    lang: record.tutorial.meta.lang || '',
    fileName: record.tutorial.meta.fileName || '',
    stepCount: record.tutorial.steps.length,
  };
}

export async function getTutorialPageData(slug: string, userId?: string) {
  const record = await loadTutorialSourceBySlug(slug);
  if (!record) {
    return null;
  }

  const normalizedDraft = ensureDraftChapters(record.tutorial);
  const steps = await buildTutorialSteps(normalizedDraft);

  // Compute chapter metadata for the reading page
  const chapters = deriveChapterSections(normalizedDraft.chapters, normalizedDraft.steps);
  const stepChapterMeta = deriveStepChapterMeta(normalizedDraft.chapters, normalizedDraft.steps);

  // Fire-and-forget view tracking (does not block rendering)
  trackTutorialViewed(slug, userId);

  return {
    source: record.source,
    steps,
    title: record.tutorial.meta.title,
    description: record.tutorial.meta.description,
    fileName: record.tutorial.meta.fileName,
    intro: record.tutorial.intro.paragraphs,
    chapters,
    stepChapterMeta,
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

export async function getTutorialDraftForExport(slug: string) {
  const record = await loadTutorialSourceBySlug(slug);
  if (!record) {
    return null;
  }
  return record.tutorial;
}

export async function getHomePageData() {
  let publishedTutorials: PublishedTutorial[] = [];
  try {
    publishedTutorials = await publishedRepo.listPublished();
  } catch (err) {
    console.error('加载已发布教程列表失败:', err);
  }

  const publishedWithMeta = publishedTutorials.map((pub) => {
    const draft = pub.tutorialDraftSnapshot;
    const stepCount = draft.steps.length;
    return {
      ...pub,
      stepCount,
      lang: draft.meta.lang || '',
      readingTime: estimateReadingTime(stepCount),
    };
  });

  return {
    publishedTutorials: publishedWithMeta,
    tutorials: listTutorials().filter((t): t is NonNullable<typeof t> => !!t).map((t) => ({
      ...t,
      readingTime: estimateReadingTime(t.stepCount),
    })),
  };
}
