'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { followTag, unfollowTag } from './follows-client';
import type { TutorialTag } from '@/lib/types/api';

interface RelatedTag extends TutorialTag {
  strength: number;
}

interface TagDetailClientProps {
  tag: TutorialTag;
  isFollowing: boolean;
  relatedTags: RelatedTag[];
}

export function TagDetailClient({
  tag,
  isFollowing: initialFollowing,
  relatedTags,
}: TagDetailClientProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const handleFollowToggle = useCallback(async () => {
    setLoading(true);
    try {
      if (isFollowing) {
        await unfollowTag(tag.id);
      } else {
        await followTag(tag.id);
      }
      setIsFollowing(!isFollowing);
    } catch (err) {
      console.error('Follow toggle failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isFollowing, tag.id]);

  return (
    <div className="space-y-6">
      {/* Follow button */}
      <Button
        onClick={handleFollowToggle}
        disabled={loading}
        variant={isFollowing ? 'outline' : 'default'}
        className={
          isFollowing ? '' : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }
      >
        {isFollowing ? '\u5df2\u5173\u6ce8' : '+ \u5173\u6ce8'}
      </Button>

      {/* Related tags */}
      {relatedTags.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            \u76f8\u5173\u6807\u7b7e
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {relatedTags.map((related) => (
              <Link key={related.id} href={`/tags/${related.slug}`}>
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {related.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
