import * as searchRepo from '../repositories/tutorial-search-repository';
import * as tagRepo from '../repositories/tag-repository';
import type { ExploreTutorial, TutorialTag } from '../types/api';

export async function getExploreData(options: {
  page?: number;
  sort?: string;
  tag?: string;
  lang?: string;
  search?: string;
}): Promise<{ tutorials: ExploreTutorial[]; total: number; tags: TutorialTag[] }> {
  // Always load tags for sidebar (cached)
  const tagsPromise = tagRepo.listAllTagsCached();

  let tutorials: ExploreTutorial[];
  let total: number;

  if (options.search && options.search.trim().length > 0) {
    const searchLimit = 50;
    const result = await searchRepo.searchPublishedTutorials(
      options.search.trim(),
      searchLimit,
      { tagSlug: options.tag, lang: options.lang },
    );
    tutorials = Array.isArray(result) ? result : (result as any).tutorials ?? result;
    total = Array.isArray(result) ? result.length : (result as any).total ?? result.length;
  } else {
    const result = await searchRepo.listPublishedForExplore({
      page: options.page,
      pageSize: 20,
      sort: options.sort === 'popular' ? 'popular' : 'newest',
      tagSlug: options.tag,
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
