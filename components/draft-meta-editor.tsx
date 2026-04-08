'use client';

import { useEffect, useState } from 'react';

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

  // 当 props 变化时（保存后父组件刷新了 draft），重置本地状态
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
    <div className="draft-meta-editor">
      <h2>元信息编辑</h2>
      <label>
        <span>标题</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        <span>描述</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        <span>简介段落（用空行分隔）</span>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={6}
        />
      </label>
      <div className="editor-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
