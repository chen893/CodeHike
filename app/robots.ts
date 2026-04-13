import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://vibedocs.dev';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/drafts/', '/admin/', '/new'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
