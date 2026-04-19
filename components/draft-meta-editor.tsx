'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FilePenLine, ScrollText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface DraftMetaEditorProps {
  title: string;
  description: string;
  introParagraphs: string[];
  onSave: (data: {
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }) => Promise<void>;
  saving: boolean;
}

export function DraftMetaEditor({
  title: propTitle,
  description: propDesc,
  introParagraphs: propIntro,
  onSave,
  saving,
}: DraftMetaEditorProps) {
  const [title, setTitle] = useState(propTitle);
  const [description, setDescription] = useState(propDesc);
  const [intro, setIntro] = useState(propIntro.join('\n\n'));

  useEffect(() => {
    setTitle(propTitle);
    setDescription(propDesc);
    setIntro(propIntro.join('\n\n'));
  }, [propTitle, propDesc, propIntro]);

  function handleSave() {
    onSave({
      title,
      description,
      introParagraphs: intro.split('\n\n').filter(Boolean),
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(246,250,253,0.9))] p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
            <FilePenLine className="h-4 w-4" />
            Meta Editing
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            教程元信息编辑
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            这里定义读者首先看到的内容：标题、摘要和开场白。它决定教程是否清楚、是否有吸引力，也决定后续步骤的叙事语气是否统一。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <MetaHint
            icon={<Sparkles className="h-4 w-4" />}
            title="标题"
            description="尽量直接表达教程主题和学习产出。"
          />
          <MetaHint
            icon={<ScrollText className="h-4 w-4" />}
            title="开场白"
            description="用两到三段建立问题、目标和阅读预期。"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">标题</span>
          <Input
            className="h-12 rounded-2xl border-slate-200 bg-slate-50 text-slate-950 focus:border-cyan-400 focus:bg-white focus:ring-cyan-400/10"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">描述</span>
          <Input
            className="h-12 rounded-2xl border-slate-200 bg-slate-50 text-slate-950 focus:border-cyan-400 focus:bg-white focus:ring-cyan-400/10"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">开场白</span>
        <Textarea
          className="min-h-[220px] rounded-[24px] border-slate-200 bg-slate-50 leading-7 text-slate-900 focus:border-cyan-400 focus:bg-white focus:ring-cyan-400/10"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={8}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-5">
        <p className="text-sm leading-6 text-slate-500">
          使用空行拆分段落，保存后会同步到教程开场区。
        </p>
        <Button type="button" onClick={handleSave} disabled={saving} className="rounded-2xl px-5">
          {saving ? '保存中...' : '保存元信息'}
        </Button>
      </div>
    </div>
  );
}

function MetaHint({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/84 p-4 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.2em]">{title}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
