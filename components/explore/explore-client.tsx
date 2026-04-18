'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TutorialTag } from '@/lib/types/api';

interface TagWithCount extends TutorialTag {
  tutorialCount: number;
}

interface ExploreClientProps {
  tags: TagWithCount[];
  activeTag: string | null;
  activeLang: string | null;
  sort: string;
  searchQuery: string;
}

export function ExploreClient(props: ExploreClientProps) {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <ExploreClientInner {...props} />
    </Suspense>
  );
}

function ExploreClientInner({
  tags,
  activeTag,
  sort,
  searchQuery,
}: ExploreClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced search
  const updateSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
          params.set('q', value);
        } else {
          params.delete('q');
        }
        params.delete('page');
        router.push(`/explore?${params.toString()}`);
      }, 400);
    },
    [router, searchParams],
  );

  const toggleSort = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const newSort = sort === 'popular' ? 'newest' : 'popular';
    params.set('sort', newSort);
    params.delete('page');
    router.push(`/explore?${params.toString()}`);
  }, [router, searchParams, sort]);

  const toggleTag = useCallback(
    (tagSlug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (activeTag === tagSlug) {
        params.delete('tag');
      } else {
        params.set('tag', tagSlug);
      }
      params.delete('page');
      router.push(`/explore?${params.toString()}`);
    },
    [router, searchParams, activeTag],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const topTags = tags.slice(0, 12);

  return (
    <div className="space-y-4">
      {/* Search + Sort row */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder="搜索教程..."
          className="flex-1 rounded-lg border border-border bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSort}
          className="whitespace-nowrap border-border text-muted-foreground hover:bg-accent"
        >
          {sort === 'popular' ? '热门优先' : '最新优先'}
        </Button>
      </div>

      {/* Tag chips */}
      {topTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topTags.filter(t => t.tutorialCount > 0 || activeTag === t.slug).map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.slug)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeTag === tag.slug
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-slate-50'
              }`}
            >
              {tag.name}
              <span className={`rounded-full px-1.5 text-[10px] ${
                activeTag === tag.slug
                  ? 'bg-primary/20 text-primary'
                  : 'bg-secondary text-muted-foreground'
              }`}>
                {tag.tutorialCount}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
