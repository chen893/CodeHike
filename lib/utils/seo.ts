/**
 * SEO utility functions for generating metadata, structured data, and reading estimates.
 */

const MINUTES_PER_STEP = 1.5;

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://vibedocs.app';
}

export function estimateReadingTime(stepCount: number): number {
  return Math.ceil(stepCount * MINUTES_PER_STEP);
}

interface OgMetadataOptions {
  title: string;
  description: string;
  slug: string;
  imageUrl?: string;
}

export function generateOgMetadata({
  title,
  description,
  slug,
  imageUrl,
}: OgMetadataOptions) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/${slug}`;
  const ogImage = imageUrl || `${baseUrl}/api/og/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'VibeDocs',
      type: 'article' as const,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: url,
    },
  };
}

interface JsonLdTutorial {
  title: string;
  description: string;
  slug: string;
  publishedAt?: string;
}

export function generateJsonLd(tutorial: JsonLdTutorial) {
  const baseUrl = getBaseUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: tutorial.title,
    description: tutorial.description,
    url: `${baseUrl}/${tutorial.slug}`,
    ...(tutorial.publishedAt && {
      datePublished: tutorial.publishedAt,
    }),
    publisher: {
      '@type': 'Organization',
      name: 'VibeDocs',
      url: baseUrl,
    },
  };
}
