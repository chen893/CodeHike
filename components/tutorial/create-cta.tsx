'use client';

import { useState } from 'react';

interface CreateCTAProps {
  slug: string;
}

export function CreateCTA({ slug }: CreateCTAProps) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
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
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Create Your Own Interactive Tutorial
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Turn any source code into a step-by-step interactive tutorial in 60 seconds.
        </p>
        <button
          onClick={handleClick}
          disabled={clicked}
          className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {clicked ? 'Redirecting...' : 'Create a Tutorial'}
        </button>
      </div>
    </div>
  );
}
