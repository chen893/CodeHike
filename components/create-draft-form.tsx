'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GenerationProgress, type GenerationContext } from './generation-progress';
import { CodeMirrorEditor } from './code-mirror-editor';
import type { SourceItem, TeachingBrief } from '@/lib/schemas/index';
import { withBasePath } from '@/lib/base-path';
import { createUuid } from '@/lib/utils/uuid';

const audienceLabels: Record<TeachingBrief['audience_level'], string> = {
  beginner: '初学者',
  intermediate: '中级',
  advanced: '高级',
};

const languageLabels: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
};

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

      const sourceItems: SourceItem[] = [
        {
          id: createUuid(),
          kind: 'snippet',
          label: sourceLabel || 'main',
          content: sourceCode,
          language: sourceLanguage,
        },
      ];

      const createRes = await fetch(withBasePath('/api/drafts'), {
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

  const generationContext: GenerationContext = {
    topic: brief.topic.trim(),
    sourceLabel: sourceLabel.trim() || 'main',
    sourceLanguage: languageLabels[sourceLanguage] || sourceLanguage,
    outputLanguage: brief.output_language,
    audienceLabel: audienceLabels[brief.audience_level],
    coreQuestion: brief.core_question.trim(),
    codeLineCount: Math.max(1, sourceCode.replace(/\n$/, '').split(/\r?\n/).length),
  };

  if (generating && draftId) {
    return (
      <GenerationProgress
        draftId={draftId}
        onComplete={handleGenerationComplete}
        context={generationContext}
      />
    );
  }

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      {/* Source code section */}
      <section className="form-section">
        <h2>源码内容</h2>
        <div className="form-section-grid">
          <div className="form-row">
            <label className="form-label">
              <span className="form-label-text">文件标签</span>
              <input
                type="text"
                className="form-input"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="例如: counter.js"
              />
            </label>
            <label className="form-label">
              <span className="form-label-text">语言</span>
              <select
                className="form-input"
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
          </div>
          <label className="form-label">
            <span className="form-label-text">代码</span>
            <CodeMirrorEditor
              value={sourceCode}
              onChange={setSourceCode}
              language={sourceLanguage}
              height="360px"
              placeholder="粘贴你的源码..."
            />
          </label>
        </div>
      </section>

      {/* Teaching brief section */}
      <section className="form-section">
        <h2>教学意图</h2>
        <div className="form-section-grid">
          <label className="form-label">
            <span className="form-label-text">主题 *</span>
            <input
              type="text"
              className="form-input"
              value={brief.topic}
              onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
              placeholder="例如: 如何构建一个 Redux store"
              required
            />
          </label>
          <div className="form-row">
            <label className="form-label">
              <span className="form-label-text">目标读者水平</span>
              <select
                className="form-input"
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
            <label className="form-label">
              <span className="form-label-text">输出语言</span>
              <select
                className="form-input"
                value={brief.output_language}
                onChange={(e) =>
                  setBrief({ ...brief, output_language: e.target.value })
                }
              >
                <option value="中文">中文</option>
                <option value="English">English</option>
              </select>
            </label>
          </div>
          <label className="form-label">
            <span className="form-label-text">核心问题 *</span>
            <textarea
              className="form-input"
              value={brief.core_question}
              onChange={(e) =>
                setBrief({ ...brief, core_question: e.target.value })
              }
              placeholder="读者学完后能理解什么？"
              rows={3}
              required
            />
          </label>
          <label className="form-label">
            <span className="form-label-text">不涉及的范围</span>
            <input
              type="text"
              className="form-input"
              value={brief.ignore_scope}
              onChange={(e) =>
                setBrief({ ...brief, ignore_scope: e.target.value })
              }
              placeholder="例如: 中间件、异步 action"
            />
          </label>
        </div>
      </section>

      {error && <div className="form-error">{error}</div>}

      <button type="submit" className="btn-accent">
        创建并生成
      </button>
    </form>
  );
}
