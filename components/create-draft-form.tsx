'use client';

import { useState } from 'react';
import { CodeMirrorEditor } from './code-mirror-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, FileCode, GitBranch, Lightbulb } from 'lucide-react';
import type { TeachingBrief } from '@/lib/schemas/index';
import { AVAILABLE_MODELS } from '@/lib/schemas/model-config';
import { STYLE_TEMPLATES } from '@/lib/ai/style-templates';
import { useCreateDraftFormController } from '@/components/drafts/use-create-draft-form-controller';
import { FIRST_EXPERIENCE_TEMPLATE } from '@/lib/first-experience-template';
import { GitHubImportTab } from '@/components/create-draft/github-import-tab';
import type { SourceItemDraft } from '@/components/drafts/create-draft-form-utils';

export function CreateDraftForm() {
  const {
    sourceItems,
    activeSourceItemId,
    setActiveSourceItemId,
    brief,
    modelId,
    setModelId,
    generating,
    error,
    setBrief,
    handleSubmit,
    updateSourceItem,
    addSourceItem,
    removeSourceItem,
    setSourceItems,
  } = useCreateDraftFormController();

  const [sourceTab, setSourceTab] = useState<'paste' | 'github'>('paste');

  const activeItem = sourceItems.find((item) => item.id === activeSourceItemId) || sourceItems[0];

  function handleGitHubImportComplete(items: SourceItemDraft[]) {
    setSourceItems(items);
    setActiveSourceItemId(items[0].id);
    setSourceTab('paste'); // Switch to paste view to show imported files
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 sm:gap-10"
    >
      {/* ── Page Header ── */}
      <header className="relative pt-4">
        {/* Monospace breadcrumb path */}
        <div className="mb-4 flex items-center gap-1.5 font-mono text-xs tracking-wide text-muted-foreground/70">
          <span className="text-primary/60">~/</span>
          <span>tutorials</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="inline-flex items-center gap-1 rounded bg-primary/8 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            <Plus className="h-3 w-3" />
            new
          </span>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              创建新教程
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              贴入源码，描述你想教什么，我们会生成一份逐步构建式教程。
            </p>
          </div>

          {/* Quick-fill CTA — aligned right on sm+ */}
          <button
            type="button"
            className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_20px_rgba(var(--primary),0.08)]"
            onClick={() => {
              const tmpl = FIRST_EXPERIENCE_TEMPLATE;
              const src = tmpl.sourceItems[0];
              updateSourceItem(activeSourceItemId, {
                label: src.label,
                language: src.language,
                content: src.content,
              });
              setBrief({
                ...brief,
                ...tmpl.teachingBrief,
              });
            }}
          >
            <span className="font-mono text-[11px] opacity-60 transition-opacity group-hover:opacity-100">{'>'}</span>
            用 Redux 示例试试
          </button>
        </div>

        {/* Subtle separator line */}
        <div className="mt-6 h-px bg-gradient-to-r from-border via-border/60 to-transparent" />
      </header>

      {/* ── Source Code Panel ── */}
      <section className="overflow-hidden rounded-xl border border-border shadow-sm">
        {/* Panel title bar — terminal / IDE aesthetic */}
        <div className="flex flex-col gap-3 border-b border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            {/* Three-dot window chrome */}
            <div className="hidden items-center gap-1.5 sm:flex">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <FileCode className="h-4 w-4 text-primary/70" />
                源码内容
                <span className="hidden font-mono text-[11px] font-normal text-muted-foreground/60 sm:inline">src/</span>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                可以添加多个文件，比如主逻辑和配置文件。
              </p>
            </div>
          </div>
          {/* Tab switcher — terminal command style */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setSourceTab('paste')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                sourceTab === 'paste'
                  ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <span className={`font-mono text-[11px] ${sourceTab === 'paste' ? 'opacity-100' : 'opacity-40'}`}>$</span>
              <FileCode className="h-3.5 w-3.5" />
              手动粘贴
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('github')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                sourceTab === 'github'
                  ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <span className={`font-mono text-[11px] ${sourceTab === 'github' ? 'opacity-100' : 'opacity-40'}`}>$</span>
              <GitBranch className="h-3.5 w-3.5" />
              GitHub 导入
            </button>
          </div>
        </div>

        {sourceTab === 'github' ? (
          <GitHubImportTab onImportComplete={handleGitHubImportComplete} />
        ) : (
        <div className="grid overflow-hidden bg-muted/10">
          {/* IDE-style tab bar */}
          <div className="flex border-b border-border bg-muted/40">
            <div className="flex flex-1 items-stretch overflow-x-auto">
              {sourceItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`group relative flex items-center gap-2 border-r border-border px-4 py-2.5 transition-all cursor-pointer select-none ${
                    activeSourceItemId === item.id
                      ? 'bg-background text-foreground shadow-[inset_0_2px_0_0_theme(colors.primary)]'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  }`}
                  onClick={() => setActiveSourceItemId(item.id)}
                >
                  {/* File icon indicator */}
                  <FileCode className={`h-3.5 w-3.5 shrink-0 ${
                    activeSourceItemId === item.id ? 'text-primary/70' : 'opacity-40'
                  }`} />
                  <span className="text-xs font-medium truncate max-w-[120px]">
                    {item.label || `untitled-${index + 1}`}
                  </span>
                  {/* Modified dot — shown when file has content */}
                  {item.content && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSourceItem(item.id);
                    }}
                    disabled={sourceItems.length <= 1}
                    className="ml-0.5 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:hidden"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSourceItem}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-muted-foreground/70 transition-colors hover:bg-background/50 hover:text-foreground"
                title="添加源码文件"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">添加</span>
              </button>
            </div>
          </div>

          <div className="grid gap-5 p-4 sm:gap-6 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                  <span className="inline-block h-1 w-1 rounded-full bg-primary/50" />
                  文件标签
                </Label>
                <Input
                  type="text"
                  className="rounded-lg border-border/80 bg-background/80 font-mono text-sm focus-visible:border-primary/40"
                  value={activeItem?.label || ''}
                  onChange={(event) =>
                    updateSourceItem(activeItem.id, { label: event.target.value })
                  }
                  placeholder="例如: store.js"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                  <span className="inline-block h-1 w-1 rounded-full bg-primary/50" />
                  语言
                </Label>
                <select
                  className="flex h-9 w-full rounded-lg border border-border/80 bg-background/80 px-3 py-1 font-mono text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={activeItem?.language || 'javascript'}
                  onChange={(event) =>
                    updateSourceItem(activeItem.id, { language: event.target.value })
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

            <div className="min-w-0 space-y-1.5">
              <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                <span className="inline-block h-1 w-1 rounded-full bg-primary/50" />
                代码
              </Label>
              <div className="min-w-0 overflow-hidden rounded-lg">
                <CodeMirrorEditor
                  key={activeItem?.id}
                  value={activeItem?.content || ''}
                  onChange={(value) => updateSourceItem(activeItem.id, { content: value })}
                  language={activeItem?.language || 'javascript'}
                  height="280px"
                  placeholder="在这里粘贴源码..."
                />
              </div>
            </div>
          </div>
        </div>
        )}
      </section>

      {/* ── Teaching Brief Section ── */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <Lightbulb className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">你想教什么</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              告诉我们你的教学意图，AI 会据此生成最合适的教程结构。
            </p>
          </div>
        </div>
        <div className="grid gap-6">
          {/* Primary fields — topic and core question */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
              <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
              主题
              <span className="text-destructive/80">*</span>
            </Label>
            <Input
              type="text"
              className="rounded-lg border-border/80 bg-background/60 text-sm focus-visible:border-primary/40"
              value={brief.topic}
              onChange={(event) => setBrief({ ...brief, topic: event.target.value })}
              placeholder="例如: Redux store 的数据流原理"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
              <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
              核心问题
              <span className="text-destructive/80">*</span>
            </Label>
            <Textarea
              className="min-h-[100px] rounded-lg border-border/80 bg-background/60 text-sm focus-visible:border-primary/40"
              value={brief.core_question}
              onChange={(event) =>
                setBrief({ ...brief, core_question: event.target.value })
              }
              placeholder="读者读完应该理解什么？"
              required
            />
          </div>

          {/* Secondary fields — visual separator */}
          <div className="h-px bg-border/50" />

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
                目标读者
              </Label>
              <select
                className="flex h-9 w-full rounded-lg border border-border/80 bg-background/60 px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
                输出语言
              </Label>
              <select
                className="flex h-9 w-full rounded-lg border border-border/80 bg-background/60 px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
              <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
              不涉及
            </Label>
            <Input
              type="text"
              className="rounded-lg border-border/80 bg-background/60 text-sm focus-visible:border-primary/40"
              value={brief.ignore_scope}
              onChange={(event) =>
                setBrief({ ...brief, ignore_scope: event.target.value })
              }
              placeholder="例如: 中间件、异步 action"
            />
          </div>

          {/* AI config row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
                AI 模型
              </Label>
              <select
                className="flex h-9 w-full rounded-lg border border-border/80 bg-background/60 px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              >
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground/70">
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500/60" />
                教学风格
              </Label>
              <select
                className="flex h-9 w-full rounded-lg border border-border/80 bg-background/60 px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={brief.preferred_style || ''}
                onChange={(event) => setBrief({ ...brief, preferred_style: event.target.value || undefined })}
              >
                <option value="">默认</option>
                {STYLE_TEMPLATES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label} — {style.description}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Error display ── */}
      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <span className="mt-0.5 font-mono text-xs font-bold text-destructive/80">ERR</span>
          <p className="text-sm leading-relaxed text-destructive">{error}</p>
        </div>
      ) : null}

      {/* ── Submit area ── */}
      <div className="flex flex-col items-end gap-2 pt-2 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="hidden text-xs text-muted-foreground/50 sm:block">
          提交后将自动开始 AI 生成流程
        </p>
        <Button
          type="submit"
          size="lg"
          className="group relative overflow-hidden rounded-lg px-10 font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 disabled:shadow-none"
          disabled={generating}
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              正在创建...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs opacity-60">{'>'}</span>
              创建并生成
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}
