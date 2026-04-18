'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TagWithCount } from '@/components/tutorial/tags-client';

interface ExploreClientProps {
  tags: TagWithCount[];
  activeTechnology: string | null;
  activeCategory: string | null;
  activeLevel: string | null;
  sort: string;
  searchQuery: string;
}

type TabType = 'all' | 'technology' | 'category' | 'level';

const TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'technology', label: '技术' },
  { key: 'category', label: '领域' },
  { key: 'level', label: '难度' },
];

export function ExploreClient(props: ExploreClientProps) {
  return (
    <Suspense fallback={<div className="h-10" />}>
      <ExploreClientInner {...props} />
    </Suspense>
  );
}

function ExploreClientInner({
  tags,
  activeTechnology,
  activeCategory,
  activeLevel,
  sort,
  searchQuery,
}: ExploreClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchQuery);
  const [activeTab, setActiveTab] = useState<TabType>('all');
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

  const toggleFilter = useCallback(
    (dimension: string, tagSlug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const currentActive =
        dimension === 'technology' ? activeTechnology
        : dimension === 'category' ? activeCategory
        : activeLevel;

      if (currentActive === tagSlug) {
        params.delete(dimension);
      } else {
        params.set(dimension, tagSlug);
      }
      // Remove legacy ?tag when using typed params
      params.delete('tag');
      params.delete('page');
      router.push(`/explore?${params.toString()}`);
    },
    [router, searchParams, activeTechnology, activeCategory, activeLevel],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const [showAllTags, setShowAllTags] = useState(false);

  // Filter tags by active tab's tagType
  const filteredTags = activeTab === 'all'
    ? tags
    : tags.filter(t => t.tagType === activeTab);

  // Check if a tag is active in any dimension
  const isActiveTag = useCallback(
    (tag: TagWithCount) => {
      if (activeTechnology === tag.slug) return true;
      if (activeCategory === tag.slug) return true;
      if (activeLevel === tag.slug) return true;
      return false;
    },
    [activeTechnology, activeCategory, activeLevel],
  );

  // Determine which dimension a tag belongs to for toggleFilter
  const getDimension = (tag: TagWithCount): string => {
    if (tag.tagType && ['technology', 'category', 'level'].includes(tag.tagType)) {
      return tag.tagType;
    }
    // Default to technology for tags without tagType
    return 'technology';
  };

  const displayedTags = showAllTags ? filteredTags : filteredTags.slice(0, 12);

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

      {/* Tab bar */}
      {tags.length > 0 && (
        <div className="flex gap-1 border-b border-border pb-px">
          {TABS.map(tab => {
            // Count tags per tab
            const count = tab.key === 'all'
              ? tags.length
              : tags.filter(t => t.tagType === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setShowAllTags(false); }}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tag chips */}
      {displayedTags.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {displayedTags.filter(t => t.tutorialCount > 0 || isActiveTag(t)).map((tag) => {
              const dimension = getDimension(tag);
              const active = isActiveTag(tag);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleFilter(dimension, tag.slug)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-slate-50'
                  }`}
                >
                  {tag.name}
                  <span className={`rounded-full px-1.5 text-[10px] ${
                    active
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary text-muted-foreground'
                  }`}>
                    {tag.tutorialCount}
                  </span>
                </button>
              );
            })}
          </div>
          {filteredTags.length > 12 && (
            <button
              onClick={() => setShowAllTags(!showAllTags)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {showAllTags ? '收起' : `查看全部 ${filteredTags.length} 个标签`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
