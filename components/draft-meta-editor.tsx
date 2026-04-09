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
      <label className="form-label">
        <span className="form-label-text">标题</span>
        <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="form-label">
        <span className="form-label-text">描述</span>
        <input
          className="form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="form-label">
        <span className="form-label-text">简介段落（用空行分隔）</span>
        <textarea
          className="form-input"
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
