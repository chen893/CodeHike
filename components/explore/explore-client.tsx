'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
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
  const [showAllTags, setShowAllTags] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      const useLegacy = dimension === 'technology' && !tags.find((item) => item.slug === tagSlug)?.tagType;

      if (useLegacy) {
        if (activeTechnology === tagSlug) {
          params.delete('tag');
        } else {
          params.set('tag', tagSlug);
        }
        params.delete('technology');
      } else {
        const currentActive =
          dimension === 'technology'
            ? activeTechnology
            : dimension === 'category'
              ? activeCategory
              : activeLevel;

        if (currentActive === tagSlug) {
          params.delete(dimension);
        } else {
          params.set(dimension, tagSlug);
        }
        params.delete('tag');
      }

      params.delete('page');
      router.push(`/explore?${params.toString()}`);
    },
    [router, searchParams, activeTechnology, activeCategory, activeLevel, tags],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const filteredTags =
    activeTab === 'all' ? tags : tags.filter((item) => item.tagType === activeTab);

  const isActiveTag = useCallback(
    (tag: TagWithCount) => {
      if (activeTechnology === tag.slug) return true;
      if (activeCategory === tag.slug) return true;
      if (activeLevel === tag.slug) return true;
      return false;
    },
    [activeTechnology, activeCategory, activeLevel],
  );

  const getDimension = (tag: TagWithCount): string => {
    if (tag.tagType && ['technology', 'category', 'level'].includes(tag.tagType)) {
      return tag.tagType;
    }
    return 'technology';
  };

  const displayedTags = showAllTags ? filteredTags : filteredTags.slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="flex items-stretch gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
            $
          </span>
          <input
            type="text"
            value={query}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="grep -r &quot;关键词&quot; tutorials/"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-8 pr-4 font-mono text-sm text-slate-900 shadow-sm placeholder:text-slate-400/60 transition-all focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleSort}
          className="h-auto whitespace-nowrap rounded-lg border-slate-200 bg-white font-mono text-xs text-slate-500 shadow-sm transition-all hover:border-cyan-400/40 hover:bg-cyan-50/50 hover:text-cyan-700"
        >
          <span className="mr-1 text-slate-400/60">sort</span>
          <span>{sort === 'popular' ? '--popular' : '--newest'}</span>
        </Button>
      </div>

      {tags.length > 0 && (
        <div className="flex gap-1 border-b border-border pb-px">
          {TABS.map((tab) => {
            const count =
              tab.key === 'all'
                ? tags.length
                : tags.filter((item) => item.tagType === tab.key).length;

            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setShowAllTags(false);
                }}
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

      {displayedTags.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {displayedTags
              .filter((item) => item.tutorialCount > 0 || isActiveTag(item))
              .map((tag) => {
                const dimension = getDimension(tag);
                const active = isActiveTag(tag);

                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleFilter(dimension, tag.slug)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                      active
                        ? 'border-cyan-400/40 bg-cyan-50 text-cyan-700 shadow-sm shadow-cyan-500/10'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    {tag.name}
                    <span
                      className={`rounded px-1 py-px text-[10px] font-mono tabular-nums ${
                        active
                          ? 'bg-cyan-100 text-cyan-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {tag.tutorialCount}
                    </span>
                  </button>
                );
              })}
          </div>
          {filteredTags.length > 12 && (
            <button
              onClick={() => setShowAllTags((current) => !current)}
              className="text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              {showAllTags ? '收起' : `查看全部 ${filteredTags.length} 个标签`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
