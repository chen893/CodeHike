'use client';

import { useEffect, useRef, useState, type DependencyList } from 'react';
import { createRequestVersionTracker } from '@/lib/utils/request-version';

export type RemoteResourceState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

interface UseRemoteResourceOptions<T> {
  deps: DependencyList;
  load: () => Promise<T>;
}

export function useRemoteResource<T>({
  deps,
  load,
}: UseRemoteResourceOptions<T>) {
  const [state, setState] = useState<RemoteResourceState<T>>({ status: 'loading' });
  const trackerRef = useRef(createRequestVersionTracker());
  const loadRef = useRef(load);
  loadRef.current = load;

  async function reload() {
    const requestVersion = trackerRef.current.begin();
    setState({ status: 'loading' });

    try {
      const data = await loadRef.current();
      if (!trackerRef.current.isCurrent(requestVersion)) return;
      setState({ status: 'success', data });
    } catch (error) {
      if (!trackerRef.current.isCurrent(requestVersion)) return;
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : '未知错误',
      });
    }
  }

  useEffect(() => {
    void reload();
    return () => {
      trackerRef.current.invalidate();
    };
  }, deps);

  return {
    state,
    reload,
  };
}
