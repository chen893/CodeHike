'use client';

import { useState } from 'react';
import { GenerationProgress } from './generation-progress';
import { CodeMirrorEditor } from './code-mirror-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, FileCode, GitBranch } from 'lucide-react';
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
    draftId,
    error,
    generationContext,
    setBrief,
    handleSubmit,
    handleGenerationComplete,
    updateSourceItem,
    addSourceItem,
    removeSourceItem,
    setSourceItems,
  } = useCreateDraftFormController();

  const [sourceTab, setSourceTab] = useState<'paste' | 'github'>('paste');

  if (generating && draftId) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <GenerationProgress
          draftId={draftId}
          onComplete={handleGenerationComplete}
          context={generationContext}
          modelId={modelId}
        />
      </div>
    );
  }

  const activeItem = sourceItems.find((item) => item.id === activeSourceItemId) || sourceItems[0];

  function handleGitHubImportComplete(items: SourceItemDraft[]) {
    setSourceItems(items);
    setActiveSourceItemId(items[0].id);
    setSourceTab('paste'); // Switch to paste view to show imported files
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-4xl flex-col gap-8"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          创建新教程
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          贴入源码，描述你想教什么，我们会生成一份逐步构建式教程。
        </p>
      </header>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
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
          用 Redux 示例试试
        </button>
        <span className="text-xs text-muted-foreground">一键填入示例代码和教学需求</span>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">源码内容</h2>
            <p className="text-sm text-muted-foreground">
              可以添加多个文件，比如主逻辑和配置文件。
            </p>
          </div>
          {/* Tab switcher */}
          <div className="flex rounded-md border border-border bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setSourceTab('paste')}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceTab === 'paste'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              手动粘贴
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('github')}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceTab === 'github'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              GitHub 导入
            </button>
          </div>
        </div>

        {sourceTab === 'github' ? (
          <GitHubImportTab onImportComplete={handleGitHubImportComplete} />
        ) : (
        <div className="grid overflow-hidden rounded-xl border border-border bg-muted/30">
          <div className="flex items-center border-b border-border bg-muted/50">
            <div className="flex flex-1 flex-wrap items-center overflow-hidden">
              {sourceItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`group relative flex h-10 items-center gap-2 border-r border-border px-4 transition-all cursor-pointer select-none ${
                    activeSourceItemId === item.id
                      ? 'bg-background text-foreground shadow-[inset_0_2px_0_0_theme(colors.primary)]'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                  }`}
                  onClick={() => setActiveSourceItemId(item.id)}
                >
                  <span className="text-xs font-medium truncate max-w-[120px]">
                    {item.label || `文件 ${index + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSourceItem(item.id);
                    }}
                    disabled={sourceItems.length <= 1}
                    className="ml-1 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:hidden"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSourceItem}
                className="flex h-10 w-10 items-center justify-center text-muted-foreground hover:bg-background/50 hover:text-foreground transition-colors border-r border-border"
                title="添加源码文件"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-6 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">文件标签</Label>
                <Input
                  type="text"
                  className="rounded-md"
                  value={activeItem?.label || ''}
                  onChange={(event) =>
                    updateSourceItem(activeItem.id, { label: event.target.value })
                  }
                  placeholder="例如: store.js"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">语言</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">代码</Label>
              <div className="overflow-hidden rounded-md border border-input bg-background">
                <CodeMirrorEditor
                  key={activeItem?.id}
                  value={activeItem?.content || ''}
                  onChange={(value) => updateSourceItem(activeItem.id, { content: value })}
                  language={activeItem?.language || 'javascript'}
                  height="400px"
                  placeholder="在这里粘贴源码..."
                />
              </div>
            </div>
          </div>
        </div>
        )}
      </section>

      <section className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
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

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">AI 模型</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">教学风格</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          disabled={generating}
        >
          创建并生成
        </Button>
      </div>
    </form>
  );
}
