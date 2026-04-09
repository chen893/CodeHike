'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GenerationProgress, type GenerationContext } from './generation-progress';
import { CodeMirrorEditor } from './code-mirror-editor';
import type { SourceItem, TeachingBrief } from '@/lib/schemas/index';
import { withBasePath } from '@/lib/base-path';
import { createUuid } from '@/lib/utils/uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

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

interface SourceItemDraft {
  id: string;
  label: string;
  language: string;
  content: string;
}

function createSourceItemDraft(): SourceItemDraft {
  return {
    id: createUuid(),
    label: '',
    language: 'javascript',
    content: '',
  };
}

function countLines(value: string) {
  const normalized = value.replace(/\n$/, '');
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

function summarizeLanguages(items: SourceItemDraft[]) {
  const unique = [...new Set(items.map((item) => languageLabels[item.language] || item.language))];

  if (unique.length === 0) return '未知';
  if (unique.length <= 2) return unique.join(' / ');
  return `${unique[0]} +${unique.length - 1}`;
}

export function CreateDraftForm() {
  const router = useRouter();

  const [sourceItems, setSourceItems] = useState<SourceItemDraft[]>(() => [createSourceItemDraft()]);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const normalizedItems = sourceItems.filter((item) => item.content.trim());

    if (normalizedItems.length === 0 || !brief.topic.trim() || !brief.core_question.trim()) {
      setError('请至少填写一个源码文件，以及主题和核心问题');
      return;
    }

    try {
      setGenerating(true);

      const payload: SourceItem[] = normalizedItems.map((item, index) => ({
        id: item.id,
        kind: 'snippet',
        label: item.label.trim() || `file-${index + 1}`,
        content: item.content,
        language: item.language,
      }));

      const createRes = await fetch(withBasePath('/api/drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceItems: payload, teachingBrief: brief }),
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

  function updateSourceItem(id: string, patch: Partial<SourceItemDraft>) {
    setSourceItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function addSourceItem() {
    setSourceItems((current) => [...current, createSourceItemDraft()]);
  }

  function removeSourceItem(id: string) {
    setSourceItems((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item.id !== id);
    });
  }

  const activeSourceItems = sourceItems.filter((item) => item.content.trim());
  const totalLineCount = Math.max(
    1,
    activeSourceItems.reduce((sum, item) => sum + countLines(item.content), 0)
  );

  const generationContext: GenerationContext = {
    topic: brief.topic.trim(),
    sourceSummary:
      activeSourceItems.length <= 1
        ? activeSourceItems[0]?.label?.trim() || 'main'
        : `${activeSourceItems.length} 个源码文件`,
    sourceCount: Math.max(activeSourceItems.length, 1),
    sourceLanguageSummary: summarizeLanguages(activeSourceItems.length > 0 ? activeSourceItems : sourceItems),
    outputLanguage: brief.output_language,
    audienceLabel: audienceLabels[brief.audience_level],
    coreQuestion: brief.core_question.trim(),
    codeLineCount: totalLineCount,
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
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 rounded-xl border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">源码内容</h2>
            <p className="text-sm text-muted-foreground">
              可以添加多个文件，比如主逻辑和配置文件。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSourceItem}
            className="w-fit gap-1.5"
          >
            <Plus className="h-4 w-4" />
            添加源码文件
          </Button>
        </div>

        <div className="space-y-6">
          {sourceItems.map((item, index) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-muted/30 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    源码文件
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSourceItem(item.id)}
                  disabled={sourceItems.length <= 1}
                  className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-6 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">文件标签</Label>
                    <Input
                      type="text"
                      className="rounded-md"
                      value={item.label}
                      onChange={(event) =>
                        updateSourceItem(item.id, { label: event.target.value })
                      }
                      placeholder="例如: store.js"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">语言</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={item.language}
                      onChange={(event) =>
                        updateSourceItem(item.id, { language: event.target.value })
                      }
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="python">Python</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="java">Java</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">代码</Label>
                  <div className="overflow-hidden rounded-md border border-input">
                    <CodeMirrorEditor
                      value={item.content}
                      onChange={(value) => updateSourceItem(item.id, { content: value })}
                      language={item.language}
                      height="300px"
                      placeholder="在这里粘贴源码..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="h-px bg-border" />

      <section className="space-y-6">
        <h2 className="text-base font-semibold tracking-tight text-foreground">你想教什么</h2>
        <div className="grid gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">主题 *</Label>
            <Input
              type="text"
              className="rounded-md"
              value={brief.topic}
              onChange={(event) => setBrief({ ...brief, topic: event.target.value })}
              placeholder="例如: Redux store 的数据流原理"
              required
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">目标读者</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={brief.audience_level}
                onChange={(event) =>
                  setBrief({
                    ...brief,
                    audience_level: event.target.value as TeachingBrief['audience_level'],
                  })
                }
              >
                <option value="beginner">初学者</option>
                <option value="intermediate">中级</option>
                <option value="advanced">高级</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">输出语言</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={brief.output_language}
                onChange={(event) =>
                  setBrief({ ...brief, output_language: event.target.value })
                }
              >
                <option value="中文">中文</option>
                <option value="English">English</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">核心问题 *</Label>
            <Textarea
              className="min-h-[100px] rounded-md"
              value={brief.core_question}
              onChange={(event) =>
                setBrief({ ...brief, core_question: event.target.value })
              }
              placeholder="读者读完应该理解什么？"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">不涉及</Label>
            <Input
              type="text"
              className="rounded-md"
              value={brief.ignore_scope}
              onChange={(event) =>
                setBrief({ ...brief, ignore_scope: event.target.value })
              }
              placeholder="例如: 中间件、异步 action"
            />
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          size="lg"
          className="rounded-md px-8 shadow-md"
        >
          创建并生成
        </Button>
      </div>
    </form>
  );
}
