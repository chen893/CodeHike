'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GenerationProgress } from './generation-progress';
import type { SourceItem, TeachingBrief } from '@/lib/schemas/index';

export function CreateDraftForm() {
  const router = useRouter();

  const [sourceCode, setSourceCode] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('javascript');

  const [brief, setBrief] = useState<TeachingBrief>({
    topic: '',
    audience_level: 'beginner',
    core_question: '',
    ignore_scope: '',
    output_language: '中文',
  });

  const [generating, setGenerating] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sourceCode.trim() || !brief.topic.trim() || !brief.core_question.trim()) {
      setError('请填写源码、主题和核心问题');
      return;
    }

    try {
      setGenerating(true);

      // 1. Create draft
      const sourceItems: SourceItem[] = [
        {
          id: crypto.randomUUID(),
          kind: 'snippet',
          label: sourceLabel || 'main',
          content: sourceCode,
          language: sourceLanguage,
        },
      ];

      const createRes = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceItems, teachingBrief: brief }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.message || '创建失败');
      }

      const draft = await createRes.json();
      setDraftId(draft.id);
      // Generation is triggered by GenerationProgress component via SSE
    } catch (err: any) {
      setError(err.message || '发生错误');
      setGenerating(false);
    }
  }

  function handleGenerationComplete() {
    if (draftId) {
      router.push(`/drafts/${draftId}`);
    }
  }

  if (generating && draftId) {
    return (
      <GenerationProgress
        draftId={draftId}
        onComplete={handleGenerationComplete}
      />
    );
  }

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <div className="create-form-grid">
        <section className="source-section">
          <h2>源码内容</h2>
          <label>
            <span>文件标签</span>
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="例如: counter.js"
            />
          </label>
          <label>
            <span>语言</span>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="java">Java</option>
            </select>
          </label>
          <label>
            <span>代码</span>
            <textarea
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              placeholder="粘贴你的源码..."
              rows={16}
              required
            />
          </label>
        </section>

        <section className="brief-section">
          <h2>教学意图</h2>
          <label>
            <span>主题 *</span>
            <input
              type="text"
              value={brief.topic}
              onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
              placeholder="例如: 如何构建一个 Redux store"
              required
            />
          </label>
          <label>
            <span>目标读者水平</span>
            <select
              value={brief.audience_level}
              onChange={(e) =>
                setBrief({
                  ...brief,
                  audience_level: e.target.value as TeachingBrief['audience_level'],
                })
              }
            >
              <option value="beginner">初学者</option>
              <option value="intermediate">中级</option>
              <option value="advanced">高级</option>
            </select>
          </label>
          <label>
            <span>核心问题 *</span>
            <textarea
              value={brief.core_question}
              onChange={(e) =>
                setBrief({ ...brief, core_question: e.target.value })
              }
              placeholder="读者学完后能理解什么？"
              rows={3}
              required
            />
          </label>
          <label>
            <span>不涉及的范围</span>
            <input
              type="text"
              value={brief.ignore_scope}
              onChange={(e) =>
                setBrief({ ...brief, ignore_scope: e.target.value })
              }
              placeholder="例如: 中间件、异步 action"
            />
          </label>
          <label>
            <span>输出语言</span>
            <select
              value={brief.output_language}
              onChange={(e) =>
                setBrief({ ...brief, output_language: e.target.value })
              }
            >
              <option value="中文">中文</option>
              <option value="English">English</option>
            </select>
          </label>
        </section>
      </div>

      {error && <div className="form-error">{error}</div>}

      <button type="submit" className="submit-btn">
        创建并生成
      </button>
    </form>
  );
}
