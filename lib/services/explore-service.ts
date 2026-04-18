import * as searchRepo from '../repositories/tutorial-search-repository';
import * as tagRepo from '../repositories/tag-repository';
import type { ExploreTutorial, TutorialTag, TagTypeType } from '../types/api';

export async function getExploreData(options: {
  page?: number;
  sort?: string;
  tag?: string;
  technology?: string;
  category?: string;
  level?: string;
  lang?: string;
  search?: string;
}): Promise<{ tutorials: ExploreTutorial[]; total: number; tags: TutorialTag[] }> {
  // Always load tags for sidebar (cached)
  const tagsPromise = tagRepo.listAllTagsCached();

  // Build multi-dimension tag filters (D-12/D-13)
  const tagFilters: { tagSlug: string; tagType: string }[] = [];
  if (options.technology) tagFilters.push({ tagSlug: options.technology, tagType: 'technology' });
  if (options.category) tagFilters.push({ tagSlug: options.category, tagType: 'category' });
  if (options.level) tagFilters.push({ tagSlug: options.level, tagType: 'level' });

  // Backward compat: ?tag=xxx uses slug-only filtering (no tagType constraint).
  // Only use the new typed filters when explicit typed params are present.
  const legacyTagSlug = (options.tag && tagFilters.length === 0) ? options.tag : undefined;

  let tutorials: ExploreTutorial[];
  let total: number;

  if (options.search && options.search.trim().length > 0) {
    const searchLimit = 50;
    const result = await searchRepo.searchPublishedTutorials(
      options.search.trim(),
      searchLimit,
      {
        tagSlug: legacyTagSlug,
        lang: options.lang,
        tagFilters: tagFilters.length > 0 ? tagFilters : undefined,
      },
    );
    tutorials = Array.isArray(result) ? result : (result as any).tutorials ?? result;
    total = Array.isArray(result) ? result.length : (result as any).total ?? result.length;
  } else {
    const result = await searchRepo.listPublishedForExplore({
      page: options.page,
      pageSize: 20,
      sort: options.sort === 'popular' ? 'popular' : 'newest',
      tagSlug: legacyTagSlug,
      tagFilters: tagFilters.length > 0 ? tagFilters : undefined,
      lang: options.lang,
    });
    tutorials = result.tutorials;
    total = result.total;
  }

  const tags = await tagsPromise;

  return { tutorials, total, tags };
}

export async function getTagsPageData(): Promise<
  (TutorialTag & { tutorialCount: number })[]
> {
  return tagRepo.listAllTagsCached();
}
