'use client';

import { useEffect, useState, useRef } from 'react';
import type { TutorialDraft } from '@/lib/schemas/tutorial-draft';

interface GenerationProgressProps {
  draftId: string;
  onComplete: () => void;
}

export function GenerationProgress({
  draftId,
  onComplete,
}: GenerationProgressProps) {
  const [status, setStatus] = useState<string>('connecting');
  const [fullText, setFullText] = useState('');
  const [parsedDraft, setParsedDraft] = useState<Partial<TutorialDraft> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const controller = new AbortController();
    let accumulated = '';

    async function run() {
      try {
        const res = await fetch(`/api/drafts/${draftId}/generate`, {
          method: 'POST',
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setStatus(`error: HTTP ${res.status}`);
          return;
        }

        setStatus('generating');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;
          const lines = lineBuffer.split('\n');
          // 保留最后一个不完整行（可能被 chunk 边界截断）
          lineBuffer = lines.pop() ?? '';

          // Parse SSE data lines
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.error) {
                setStatus(`error: ${event.error}`);
              } else if (event.done) {
                setStatus('stream-complete');
              } else if (event.text) {
                accumulated += event.text;
                setFullText(accumulated);
                // Try parse partial JSON
                try {
                  const start = accumulated.indexOf('{');
                  if (start !== -1) {
                    // Attempt to parse what we have
                    const partial = accumulated.slice(start);
                    // Try to close any open brackets
                    let obj: any;
                    try {
                      obj = JSON.parse(partial);
                    } catch {
                      // Add closing brackets and try
                      let fixed = partial;
                      let opens = 0;
                      for (const c of fixed) {
                        if (c === '{' || c === '[') opens++;
                        if (c === '}' || c === ']') opens--;
                      }
                      for (let i = 0; i < opens; i++) fixed += '}';
                      try { obj = JSON.parse(fixed); } catch { /* partial JSON, ignore */ }
                    }
                    if (obj) setParsedDraft(obj);
                  }
                } catch { /* partial JSON parse failed, ignore */ }
              }
            } catch { /* non-JSON SSE line, ignore */ }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setStatus(`error: ${err.message}`);
        }
      }
    }

    run();
    return () => controller.abort();
  }, [draftId]);

  // Poll for server-side persistence to complete
  useEffect(() => {
    if (status !== 'stream-complete') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/drafts/${draftId}`);
        if (res.ok) {
          const draft = await res.json();
          if (draft.generationState === 'succeeded') {
            clearInterval(interval);
            onCompleteRef.current();
          } else if (draft.generationState === 'failed') {
            clearInterval(interval);
            setStatus(`failed: ${draft.generationErrorMessage}`);
          }
        }
      } catch {
        // 轮询失败，下次重试
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [status, draftId]);

  const partial = parsedDraft;

  return (
    <div className="generation-progress">
      <div className="generation-status">
        {status !== 'error' && status !== 'stream-complete' && !status.startsWith('failed') && (
          <div className="generation-spinner" />
        )}
        <span>
          {status === 'connecting'
            ? '正在连接 AI...'
            : status === 'generating'
              ? '正在生成教程...'
              : status === 'stream-complete'
                ? '正在校验和保存...'
                : status.startsWith('error') || status.startsWith('failed')
                  ? status
                  : status}
        </span>
      </div>

      {partial && (
        <div className="generation-preview">
          {partial.meta?.title && (
            <h2 className="preview-title">{partial.meta.title}</h2>
          )}
          {partial.meta?.description && (
            <p className="preview-desc">{partial.meta.description}</p>
          )}
          {partial.steps && partial.steps.length > 0 && (
            <div className="preview-steps">
              {partial.steps.map((step, i) => (
                <div key={step?.id || i} className="preview-step">
                  <span className="step-number">步骤 {i + 1}</span>
                  <span className="step-title">{step?.title || '...'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
