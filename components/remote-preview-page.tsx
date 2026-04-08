'use client';

import { useEffect, useState } from 'react';
import { TutorialScrollyDemo } from './tutorial-scrolly-demo';

interface RemotePreviewPageProps {
  fetchUrl: string;
  title: string;
}

export function RemotePreviewPage({ fetchUrl, title }: RemotePreviewPageProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'success'; payload: any }
    | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        if (!cancelled) setState({ status: 'success', payload });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchUrl]);

  if (state.status === 'loading') {
    return (
      <main className="tutorial-page">
        <div className="loading-bar">
          <div className="loading-pulse" />
          <p>{title} — 加载中...</p>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="tutorial-page">
        <div className="loading-bar">
          <p>加载失败: {state.message}</p>
        </div>
      </main>
    );
  }

  const { payload } = state;

  return (
    <main className="tutorial-page">
      <TutorialScrollyDemo
        steps={payload.steps}
        intro={payload.intro}
        title={payload.title}
        fileName={payload.fileName}
      />
    </main>
  );
}
