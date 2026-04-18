'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownEditor } from './markdown-editor';
import { CodePreviewPanel } from './step-editor/code-preview-panel';
import { IntermediatePatchPreview } from './step-editor/intermediate-preview';
import { PatchItem } from './step-editor/patch-item';
import { FocusMarksPanel } from './step-editor/focus-marks-panel';
import { computeDiffLines, formatUnifiedDiff } from './step-editor/diff-utils';
import { usePatchValidation } from './step-editor/use-patch-validation';
import type { SelectionMode, FocusRange, PatchDraft, MarkDraft } from './step-editor/types';
import {
  getStepCodePreview,
  summarizeCodeDiff,
} from '@/lib/tutorial/draft-code';
import { normalizeBaseCode } from '@/lib/tutorial/normalize';
import { createUuid } from '@/lib/utils/uuid';
import type {
  ContentPatch,
  ContentMark,
  TutorialDraft,
  TutorialStep,
} from '@/lib/schemas/tutorial-draft';

interface StepEditorProps {
  tutorialDraft: TutorialDraft;
  step: TutorialStep;
  stepIndex: number;
  onSave: (stepId: string, data: any) => Promise<void>;
  onRegenerate: (stepId: string, mode: 'prose' | 'step') => Promise<void>;
  saving: boolean;
}

function normalizePatches(items: PatchDraft[], isMultiFile: boolean): ContentPatch[] {
  return items
    .filter((item) => item.find.trim() || item.replace.trim())
    .map(({ find, replace, file }) => {
      const patch: ContentPatch = { find, replace };
      if (isMultiFile && file) patch.file = file;
      return patch;
    });
}

function normalizeMarks(items: MarkDraft[], isMultiFile: boolean): ContentMark[] {
  return items
    .filter((item) => item.find.trim())
    .map(({ find, color, file }) => {
      const mark: ContentMark = { find, color: color || '#2563eb' };
      if (isMultiFile && file) mark.file = file;
      return mark;
    });
}

function toPatchDrafts(items?: ContentPatch[]): PatchDraft[] {
  return (items ?? []).map((item) => ({
    localId: createUuid(),
    find: item.find,
    replace: item.replace,
    file: item.file,
  }));
}

function toMarkDrafts(items?: ContentMark[]): MarkDraft[] {
  return (items ?? []).map((item) => ({
    localId: createUuid(),
    find: item.find,
    color: item.color,
    file: item.file,
  }));
}

function getStructureSignature(step: {
  patches?: ContentPatch[];
  focus?: { find: string; file?: string } | null;
  marks?: ContentMark[];
}) {
  return JSON.stringify({
    patches: step.patches ?? [],
    focus: step.focus?.find ?? null,
    focusFile: step.focus?.file ?? null,
    marks: step.marks ?? [],
  });
}

function extractFindFromLines(code: string, startLine: number, endLine: number): string {
  const lines = code.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

const INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function StepEditor({
  tutorialDraft,
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
  const [patches, setPatches] = useState<PatchDraft[]>(() => toPatchDrafts(step.patches));
  const [focusFind, setFocusFind] = useState(step.focus?.find ?? '');
  const [focusFile, setFocusFile] = useState(step.focus?.file ?? '');
  const [marks, setMarks] = useState<MarkDraft[]>(() => toMarkDrafts(step.marks));
  const diffViewRef = useRef<HTMLDivElement>(null);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('off');
  const [focusRange, setFocusRange] = useState<FocusRange | null>(null);
  const [markedLines, setMarkedLines] = useState<Set<number>>(new Set());
  const [focusAnchorLine, setFocusAnchorLine] = useState<number | null>(null);

  const handleLineClick = useCallback(
    (lineNumber: number, event: React.MouseEvent) => {
      if (selectionMode === 'focus') {
        if (event.shiftKey && focusAnchorLine !== null) {
          const start = Math.min(focusAnchorLine, lineNumber);
          const end = Math.max(focusAnchorLine, lineNumber);
          setFocusRange({ startLine: start, endLine: end });
        } else {
          setFocusAnchorLine(lineNumber);
          setFocusRange({ startLine: lineNumber, endLine: lineNumber });
        }
      } else if (selectionMode === 'mark') {
        setMarkedLines((prev) => {
          const next = new Set(prev);
          if (next.has(lineNumber)) {
            next.delete(lineNumber);
          } else {
            next.add(lineNumber);
          }
          return next;
        });
      }
    },
    [selectionMode, focusAnchorLine]
  );

  useEffect(() => {
    setFocusRange(null);
    setFocusAnchorLine(null);
    setMarkedLines(new Set());
  }, [patches]);

  // ─── Multi-file context ────────────────────────────────────────
  const baseCodeMeta = useMemo(
    () => normalizeBaseCode(tutorialDraft.baseCode, tutorialDraft.meta),
    [tutorialDraft.baseCode, tutorialDraft.meta]
  );
  const isMultiFile = Object.keys(baseCodeMeta.files).length > 1;
  const fileNames = useMemo(
    () => Object.keys(baseCodeMeta.files),
    [baseCodeMeta.files]
  );
  const [previewFile, setPreviewFile] = useState(baseCodeMeta.primaryFile);
  const language = isMultiFile ? previewFile.split('.').pop() || 'javascript' : tutorialDraft.meta.lang;

  useEffect(() => {
    setEyebrow(step.eyebrow ?? '');
    setTitle(step.title);
    setLead(step.lead ?? '');
    setParagraphs(step.paragraphs.join('\n\n'));
    setPatches(toPatchDrafts(step.patches));
    setFocusFind(step.focus?.find ?? '');
    setFocusFile(step.focus?.file ?? '');
    setMarks(toMarkDrafts(step.marks));
  }, [step]);

  // ─── Derived data ──────────────────────────────────────────────
  const normalizedParagraphs = useMemo(
    () => paragraphs.split('\n\n').map((s) => s.trim()).filter(Boolean),
    [paragraphs]
  );

  const codePreview = useMemo(() => {
    const np = normalizePatches(patches, isMultiFile);
    const nm = normalizeMarks(marks, isMultiFile);
    const f = focusFind.trim()
      ? { find: focusFind, ...(isMultiFile && focusFile ? { file: focusFile } : {}) }
      : null;

    const codeStep: TutorialStep = {
      ...step,
      patches: np.length > 0 ? np : undefined,
      focus: f,
      marks: nm.length > 0 ? nm : undefined,
    };

    const dfp: TutorialDraft = {
      ...tutorialDraft,
      steps: tutorialDraft.steps.map((item, index) =>
        index === stepIndex ? codeStep : item
      ),
    };

    let previousCode = '';
    let currentCode = '';
    let previewError: string | null = null;
    let diffSummary = { added: 0, removed: 0, modified: 0 };

    try {
      const preview = getStepCodePreview(dfp, stepIndex, codeStep);
      if (isMultiFile) {
        previousCode = preview.previousFiles[previewFile] || '';
        currentCode = preview.currentFiles[previewFile] || '';
        diffSummary = summarizeCodeDiff(previousCode, currentCode);
      } else {
        previousCode = preview.previousCode;
        currentCode = preview.currentCode;
        diffSummary = preview.diffSummary;
      }
    } catch (error) {
      previewError = error instanceof Error ? error.message : String(error);
    }

    return { normalizedPatches: np, normalizedMarks: nm, focus: f, previousCode, currentCode, previewError, diffSummary };
  }, [step, tutorialDraft, stepIndex, patches, marks, focusFind, focusFile, isMultiFile, previewFile]);

  const { normalizedPatches, normalizedMarks, focus, previousCode, currentCode, previewError, diffSummary } = codePreview;

  const previousCodeForValidation = useMemo(() => {
    try {
      const preview = getStepCodePreview(
        { ...tutorialDraft, steps: tutorialDraft.steps },
        stepIndex,
        tutorialDraft.steps[stepIndex]
      );
      return isMultiFile
        ? preview.previousFiles[previewFile] || ''
        : preview.previousCode;
    } catch {
      return '';
    }
  }, [tutorialDraft, stepIndex, isMultiFile, previewFile]);

  const patchValidationStates = usePatchValidation(previousCodeForValidation, normalizedPatches);

  // ─── Sync line selection to state ──────────────────────────────
  useEffect(() => {
    if (focusRange && currentCode && selectionMode === 'focus') {
      const text = extractFindFromLines(currentCode, focusRange.startLine, focusRange.endLine);
      setFocusFind(text);
      if (isMultiFile) setFocusFile(previewFile);
    }
  }, [focusRange, selectionMode, currentCode, previewFile, isMultiFile]);

  useEffect(() => {
    if (selectionMode === 'mark' && currentCode) {
      setMarks((prev) => {
        const newFromSelection = Array.from(markedLines).map((lineNum) => {
          const text = extractFindFromLines(currentCode, lineNum, lineNum);
          const existing = prev.find((m) => m.find === text);
          return {
            localId: existing?.localId ?? createUuid(),
            find: text,
            color: existing?.color ?? '#2563eb',
            ...(isMultiFile && previewFile ? { file: previewFile } : {}),
          };
        });
        return newFromSelection;
      });
    }
  }, [markedLines, selectionMode, currentCode, previewFile, isMultiFile]);

  // ─── Structure change detection ────────────────────────────────
  const hasStructuralChanges = useMemo(() => {
    const original = getStructureSignature(step);
    const current = getStructureSignature({ patches: normalizedPatches, focus, marks: normalizedMarks });
    return original !== current;
  }, [step, normalizedPatches, focus, normalizedMarks]);

  const saveDisabled = saving || !title.trim() || (hasStructuralChanges && !!previewError);

  const diffLines = useMemo(() => computeDiffLines(previousCode, currentCode), [previousCode, currentCode]);
  const displayedDiffLines = useMemo(
    () => (selectionMode !== 'off' ? diffLines : formatUnifiedDiff(diffLines, 5)),
    [selectionMode, diffLines]
  );

  // ─── Callbacks for sub-components ──────────────────────────────
  const handlePatchUpdate = useCallback((localId: string, field: 'find' | 'replace' | 'file', value: string) => {
    setPatches((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, [field]: field === 'file' ? (value || undefined) : value }
          : item
      )
    );
  }, []);

  const handlePatchDelete = useCallback((localId: string) => {
    setPatches((current) => current.filter((item) => item.localId !== localId));
  }, []);

  const handleSetPatchFind = useCallback((text: string) => {
    setPatches((current) => {
      if (current.length === 0) {
        return [{ localId: createUuid(), find: text, replace: '' }];
      }
      return current.map((item, i) => (i === 0 ? { ...item, find: text } : item));
    });
  }, []);

  const handleFocusRangeClear = useCallback(() => {
    setFocusRange(null);
    setFocusAnchorLine(null);
    setFocusFind('');
  }, []);

  function handleSave() {
    const payload: Record<string, unknown> = {
      eyebrow: eyebrow || undefined,
      title: title.trim(),
      lead: lead || undefined,
      paragraphs: normalizedParagraphs,
    };
    if (hasStructuralChanges) {
      payload.patches = normalizedPatches;
      payload.focus = focus;
      payload.marks = normalizedMarks;
    }
    void onSave(step.id, payload);
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/50 pb-6">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Step {stepIndex + 1} Editor
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">{step.title}</h3>
          <p className="text-xs text-muted-foreground">编辑步骤的文案和代码变更。</p>
        </div>
        {hasStructuralChanges ? (
          <span className="inline-flex w-fit items-center rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 border border-amber-200">
            结构改动待保存
          </span>
        ) : null}
      </div>

      {/* Prose fields */}
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Eyebrow</span>
          <input className={INPUT_CLASS} value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="例如：准备工作" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">标题</span>
          <input className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">导语 (Lead)</span>
        <input className={`${INPUT_CLASS} italic text-muted-foreground`} value={lead} onChange={(e) => setLead(e.target.value)} placeholder="步骤的核心概括..." />
      </label>

      {/* Code + Patches grid */}
      <div className="grid gap-6 xl:grid-cols-2">
        <CodePreviewPanel
          selectionMode={selectionMode}
          onSelectionModeChange={setSelectionMode}
          focusRange={focusRange}
          onFocusRangeClear={handleFocusRangeClear}
          markedLines={markedLines}
          onMarkedLinesClear={() => setMarkedLines(new Set())}
          previousCode={previousCode}
          currentCode={currentCode}
          previewError={previewError}
          diffSummary={diffSummary}
          displayedDiffLines={displayedDiffLines}
          isMultiFile={isMultiFile}
          fileNames={fileNames}
          previewFile={previewFile}
          onPreviewFileChange={setPreviewFile}
          language={language}
          onLineClick={handleLineClick}
          diffViewRef={diffViewRef}
          onSetPatchFind={handleSetPatchFind}
          onSetFocus={setFocusFind}
        />

        <section className="space-y-4 rounded-lg bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Patches</h4>
              <p className="text-[10px] text-muted-foreground">定义当前步骤的代码变更。</p>
            </div>
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2.5 text-[10px] font-bold text-foreground transition-colors hover:bg-accent"
              onClick={() => setPatches((current) => [...current, { localId: createUuid(), find: '', replace: '' }])}
            >
              + 添加 Patch
            </button>
          </div>

          <div className="space-y-3">
            {patches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                当前步骤没有 patch
              </div>
            ) : null}
            {patches.map((patch, index) => (
              <PatchItem
                key={patch.localId}
                patch={patch}
                index={index}
                isMultiFile={isMultiFile}
                fileNames={fileNames}
                validationState={patchValidationStates[index]}
                onUpdate={handlePatchUpdate}
                onDelete={handlePatchDelete}
              />
            ))}
          </div>

          <IntermediatePatchPreview
            previousCode={previousCodeForValidation}
            patches={normalizedPatches}
            language={language}
          />

          <FocusMarksPanel
            focusFind={focusFind}
            setFocusFind={setFocusFind}
            focusFile={focusFile}
            setFocusFile={setFocusFile}
            marks={marks}
            setMarks={setMarks}
            isMultiFile={isMultiFile}
            fileNames={fileNames}
          />
        </section>
      </div>

      {/* Markdown paragraphs */}
      <label className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">讲解段落 (Markdown)</span>
        <MarkdownEditor value={paragraphs} onChange={setParagraphs} placeholder="支持 Markdown 语法" />
      </label>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-6">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? '保存中...' : '保存步骤'}
        </button>
        <div className="flex items-center rounded-md border border-border bg-card p-1">
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onRegenerate(step.id, regenMode)}
            disabled={saving}
          >
            {saving ? '正在处理...' : `重新生成${regenMode === 'prose' ? '文案' : '完整内容'}`}
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          <select
            value={regenMode}
            onChange={(e) => setRegenMode(e.target.value as 'prose' | 'step')}
            className="h-8 bg-transparent px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground"
          >
            <option value="prose">仅文案</option>
            <option value="step">完整步骤</option>
          </select>
        </div>
      </div>
    </div>
  );
}
