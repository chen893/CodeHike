'use client';

import { useEffect, useState } from 'react';
import type { TutorialStep } from '@/lib/schemas/tutorial-draft';

interface StepEditorProps {
  step: TutorialStep;
  stepIndex: number;
  onSave: (stepId: string, data: any) => Promise<void>;
  onRegenerate: (stepId: string, mode: 'prose' | 'step') => Promise<void>;
  saving: boolean;
}

export function StepEditor({
  step,
  stepIndex,
  onSave,
  onRegenerate,
  saving,
}: StepEditorProps) {
  const [eyebrow, setEyebrow] = useState(step.eyebrow ?? '');
  const [title, setTitle] = useState(step.title);
  const [lead, setLead] = useState(step.lead ?? '');
  const [paragraphs, setParagraphs] = useState(step.paragraphs.join('\n\n'));
  const [regenMode, setRegenMode] = useState<'prose' | 'step'>('prose');

  // 当 step prop 变化时（切换步骤或重新生成后），重置本地状态
  useEffect(() => {
    setEyebrow(step.eyebrow ?? '');
    setTitle(step.title);
    setLead(step.lead ?? '');
    setParagraphs(step.paragraphs.join('\n\n'));
  }, [step]);

  function handleSave() {
    onSave(step.id, {
      eyebrow: eyebrow || undefined,
      title,
      lead: lead || undefined,
      paragraphs: paragraphs.split('\n\n').filter(Boolean),
    });
  }

  return (
    <div className="step-editor">
      <h3>
        Step {stepIndex + 1}: {step.title}
      </h3>

      <label>
        <span>Eyebrow</span>
        <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} />
      </label>
      <label>
        <span>标题</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        <span>导语</span>
        <input value={lead} onChange={(e) => setLead(e.target.value)} />
      </label>
      <label>
        <span>讲解段落（用空行分隔）</span>
        <textarea
          value={paragraphs}
          onChange={(e) => setParagraphs(e.target.value)}
          rows={8}
        />
      </label>

      <div className="editor-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onRegenerate(step.id, regenMode)}
          disabled={saving}
        >
          重新生成 ({regenMode === 'prose' ? '仅文案' : '完整步骤'})
        </button>
        <select
          value={regenMode}
          onChange={(e) => setRegenMode(e.target.value as 'prose' | 'step')}
          className="btn btn-secondary"
        >
          <option value="prose">仅文案</option>
          <option value="step">完整步骤</option>
        </select>
      </div>
    </div>
  );
}
