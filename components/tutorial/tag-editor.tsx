'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Loader2 } from 'lucide-react';
import {
  fetchTags,
  updateTutorialTags,
  type TagWithCount,
} from './tags-client';
import type { TutorialTag } from '@/lib/types/api';

interface TagEditorProps {
  tutorialId: string;
  currentTags: TutorialTag[];
}

export function TagEditor({ tutorialId, currentTags }: TagEditorProps) {
  const [tags, setTags] = useState<TutorialTag[]>(currentTags);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<TagWithCount[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load all tags for autocomplete on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTags()
      .then((allTags) => {
        if (!cancelled) setSuggestions(allTags);
      })
      .catch(() => {
        // Silently fail — autocomplete is a nice-to-have
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close suggestions on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.name.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.some((t) => t.id === s.id),
  );

  const handleRemoveTag = useCallback(
    async (tagId: string) => {
      const newTags = tags.filter((t) => t.id !== tagId);
      setTags(newTags);
      setError(null);

      try {
        setSaving(true);
        const updated = await updateTutorialTags(
          tutorialId,
          newTags.map((t) => t.name),
        );
        setTags(updated);
      } catch (err: any) {
        setError(err.message || '更新标签失败');
        setTags(tags); // Revert
      } finally {
        setSaving(false);
      }
    },
    [tags, tutorialId],
  );

  const handleAddTag = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
        setInputValue('');
        setShowSuggestions(false);
        return;
      }

      const newTagNames = [...tags.map((t) => t.name), trimmed];
      setError(null);
      setInputValue('');
      setShowSuggestions(false);

      try {
        setSaving(true);
        const updated = await updateTutorialTags(tutorialId, newTagNames);
        setTags(updated);
      } catch (err: any) {
        setError(err.message || '添加标签失败');
      } finally {
        setSaving(false);
      }
    },
    [tags, tutorialId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTag(inputValue);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [inputValue, handleAddTag],
  );

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        标签
      </label>

      {/* Tag badges */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag.id}
            className="gap-1 bg-primary/10 text-primary border-primary/30 pr-1"
          >
            {tag.name}
            <button
              onClick={() => handleRemoveTag(tag.id)}
              disabled={saving}
              className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20 disabled:opacity-50"
              aria-label={`移除标签 ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Add tag input */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              placeholder="输入标签名称..."
              disabled={saving}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
          </div>
          <button
            onClick={() => handleAddTag(inputValue)}
            disabled={saving || !inputValue.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            添加
          </button>
        </div>

        {/* Autocomplete suggestions */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg"
          >
            <ul className="max-h-40 overflow-auto py-1">
              {filteredSuggestions.slice(0, 8).map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => handleAddTag(suggestion.name)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-slate-50"
                  >
                    <span className="text-slate-700">{suggestion.name}</span>
                    <span className="text-xs text-slate-400">
                      {suggestion.tutorialCount} 篇教程
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
