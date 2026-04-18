'use client';

import { useEffect, useState } from 'react';
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
      <div className="space-y-1">
        <h3 className="text-xl font-bold tracking-tight text-foreground">元信息编辑</h3>
        <p className="text-xs text-muted-foreground">
          修改教程的标题、描述和开场白。
        </p>
      </div>

      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">标题</span>
          <Input
            className="bg-card border-border focus:ring-ring"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">描述</span>
          <Input
            className="bg-card border-border focus:ring-ring"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">开场白</span>
          <Textarea
            className="min-h-[120px] bg-card border-border focus:ring-ring leading-6"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={5}
          />
        </label>
        <div className="flex items-center justify-end border-t border-border/50 pt-5">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md h-9 px-4"
          >
            {saving ? '保存中...' : '保存元信息'}
          </Button>
        </div>
      </div>
    </div>
  );
}
