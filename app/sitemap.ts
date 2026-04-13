import type { MetadataRoute } from 'next';
import { getHomePageData } from '@/lib/services/tutorial-queries';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://vibedocs.dev';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { publishedTutorials, tutorials } = await getHomePageData();

  const tutorialEntries: MetadataRoute.Sitemap = [
    ...publishedTutorials.map((t) => ({
      url: `${BASE_URL}/${t.slug}`,
      lastModified: t.publishedAt ? new Date(t.publishedAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...tutorials.map((t) => ({
      url: `${BASE_URL}/${t.slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];

  return [...staticEntries, ...tutorialEntries];
}
