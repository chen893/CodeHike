'use client';

import { useState } from 'react';

interface CreateCTAProps {
  slug: string;
}

export function CreateCTA({ slug }: CreateCTAProps) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    // Fire-and-forget tracking with keepalive to survive navigation
    try {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'cta_clicked',
          payload: { ctaId: 'create-from-tutorial', source: slug },
          slug,
        }),
        keepalive: true,
      });
    } catch {
      // Tracking failure should not block navigation
    }
    window.location.href = '/new?ref=cta';
  };

  return (
    <div className="w-full">
      <div className="rounded-lg border border-border bg-card p-8 text-center sm:p-10">
        <h3 className="text-xl font-bold text-foreground">
          创建你自己的交互式教程
        </h3>
        <p className="mt-3 text-base text-muted-foreground">
          选择一段源码，快速生成可以继续编辑和发布的分步教程。
        </p>
        <button
          onClick={handleClick}
          disabled={clicked}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-8 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
        >
          {clicked ? '正在跳转...' : '立即开始创建'}
        </button>
      </div>
    </div>
  );
}

