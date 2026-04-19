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

function hasValidMarkRange(
  item: MarkDraft
): item is MarkDraft & { start: number; end: number } {
  return (
    Number.isInteger(item.start) &&
    Number.isInteger(item.end) &&
    item.start !== null &&
    item.end !== null &&
    item.end >= item.start
  );
}

function normalizeMarks(items: MarkDraft[], isMultiFile: boolean): ContentMark[] {
  return items
    .filter(hasValidMarkRange)
    .map(({ start, end, color, file }) => {
      const mark: ContentMark = { start, end, color: color || '#2563eb' };
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

function toFocusRange(focus: TutorialStep['focus'] | null | undefined): FocusRange | null {
  if (
    focus &&
    Number.isInteger(focus.start) &&
    Number.isInteger(focus.end) &&
    focus.start >= 1 &&
    focus.end >= focus.start
  ) {
    return { startLine: focus.start, endLine: focus.end };
  }

  return null;
}

function toMarkDrafts(items?: ContentMark[]): MarkDraft[] {
  return (items ?? []).map((item) => ({
    localId: createUuid(),
    start: typeof item.start === 'number' ? item.start : null,
    end: typeof item.end === 'number' ? item.end : null,
    color: item.color,
    file: item.file,
  }));
}

function getStructureSignature(step: {
  patches?: ContentPatch[];
  focus?: { start: number; end: number; file?: string } | null;
  marks?: ContentMark[];
}) {
  return JSON.stringify({
    patches: step.patches ?? [],
    focusStart: step.focus?.start ?? null,
    focusEnd: step.focus?.end ?? null,
    focusFile: step.focus?.file ?? null,
    marks: step.marks ?? [],
  });
}

function extractFindFromLines(code: string, startLine: number, endLine: number): string {
  const lines = code.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

function expandMarkLines(items: MarkDraft[], currentFile?: string | null): Set<number> {
  const lines = new Set<number>();

  for (const mark of items) {
    if (currentFile && mark.file && mark.file !== currentFile) {
      continue;
    }
    if (!hasValidMarkRange(mark)) {
      continue;
    }
    for (let line = mark.start; line <= mark.end; line++) {
      lines.add(line);
    }
  }

  return lines;
}

function filterMarksForFile(items: MarkDraft[], currentFile?: string | null): MarkDraft[] {
  return items.filter((mark) => {
    if (!currentFile) return !mark.file;
    return (mark.file || currentFile) === currentFile;
  });
}

function getFocusTargetFile(
  isMultiFile: boolean,
  previewFile: string,
  focusFile: string,
  primaryFile: string,
): string | null {
  if (!isMultiFile) return null;
  return focusFile || previewFile || primaryFile;
}

const INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50';

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
  const [focusRange, setFocusRange] = useState<FocusRange | null>(() => toFocusRange(step.focus));
  const [focusFile, setFocusFile] = useState(step.focus?.file ?? '');
  const [marks, setMarks] = useState<MarkDraft[]>(() => toMarkDrafts(step.marks));
  const diffViewRef = useRef<HTMLDivElement>(null);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('off');
  const [focusAnchorLine, setFocusAnchorLine] = useState<number | null>(null);

  // ─── Multi-file context ────────────────────────────────────────
  const baseCodeMeta = useMemo(
    () => normalizeBaseCode(tutorialDraft.baseCode, tutorialDraft.meta),
    [tutorialDraft.baseCode, tutorialDraft.meta]
  );
  const isMultiFile = Object.keys(baseCodeMeta.files).length > 1;
  const primaryFile = baseCodeMeta.primaryFile;
  const fileNames = useMemo(
    () => Object.keys(baseCodeMeta.files),
    [baseCodeMeta.files]
  );
  const [previewFile, setPreviewFile] = useState(baseCodeMeta.primaryFile);
  const language = isMultiFile ? previewFile.split('.').pop() || 'javascript' : tutorialDraft.meta.lang;

  const handleLineClick = useCallback(
    (lineNumber: number, event: React.MouseEvent) => {
      if (selectionMode === 'focus') {
        const targetFile = getFocusTargetFile(isMultiFile, previewFile, focusFile, primaryFile);
        if (event.shiftKey && focusAnchorLine !== null) {
          const start = Math.min(focusAnchorLine, lineNumber);
          const end = Math.max(focusAnchorLine, lineNumber);
          setFocusRange({ startLine: start, endLine: end });
        } else {
          setFocusAnchorLine(lineNumber);
          setFocusRange({ startLine: lineNumber, endLine: lineNumber });
        }
        if (targetFile) {
          setFocusFile(targetFile);
        }
      } else if (selectionMode === 'mark') {
        setMarks((current) => {
          const targetFile = isMultiFile && previewFile ? previewFile : undefined;
          const existing = current.find((mark) =>
            mark.start === lineNumber &&
            mark.end === lineNumber &&
            (mark.file || undefined) === targetFile
          );

          if (existing) {
            return current.filter((mark) => mark.localId !== existing.localId);
          }

          return [
            ...current,
            {
              localId: createUuid(),
              start: lineNumber,
              end: lineNumber,
              color: '#2563eb',
              ...(targetFile ? { file: targetFile } : {}),
            },
          ];
        });
      }
    },
    [selectionMode, focusAnchorLine, isMultiFile, previewFile, focusFile, primaryFile]
  );

  useEffect(() => {
    if (!focusRange) {
      setFocusAnchorLine(null);
    }
  }, [focusRange]);

  useEffect(() => {
    setEyebrow(step.eyebrow ?? '');
    setTitle(step.title);
    setLead(step.lead ?? '');
    setParagraphs(step.paragraphs.join('\n\n'));
    setPatches(toPatchDrafts(step.patches));
    setFocusRange(toFocusRange(step.focus));
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
    const f = focusRange
      ? {
          start: focusRange.startLine,
          end: focusRange.endLine,
          ...(isMultiFile && focusFile ? { file: focusFile } : {}),
        }
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
  }, [step, tutorialDraft, stepIndex, patches, marks, focusRange, focusFile, isMultiFile, previewFile]);

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

  // ─── Structure change detection ────────────────────────────────
  const hasStructuralChanges = useMemo(() => {
    const original = getStructureSignature(step);
    const current = getStructureSignature({ patches: normalizedPatches, focus, marks: normalizedMarks });
    return original !== current;
  }, [step, normalizedPatches, focus, normalizedMarks]);

  const saveDisabled = saving || !title.trim() || (hasStructuralChanges && !!previewError);

  const diffLines = useMemo(() => computeDiffLines(previousCode, currentCode), [previousCode, currentCode]);
  const visibleFocusRange = useMemo(() => {
    if (!focusRange) return null;
    if (!isMultiFile) return focusRange;
    const targetFile = getFocusTargetFile(isMultiFile, previewFile, focusFile, primaryFile);
    return previewFile === targetFile ? focusRange : null;
  }, [focusRange, isMultiFile, previewFile, focusFile, primaryFile]);
  const activeFocusFile = useMemo(() => {
    if (!focusRange) return null;
    return getFocusTargetFile(isMultiFile, previewFile, focusFile, primaryFile);
  }, [focusRange, isMultiFile, previewFile, focusFile, primaryFile]);
  const visibleMarks = useMemo(() => filterMarksForFile(marks, isMultiFile ? previewFile : null), [marks, isMultiFile, previewFile]);
  const markedLines = useMemo(() => expandMarkLines(visibleMarks), [visibleMarks]);
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
    setFocusAnchorLine(null);
  }, []);

  const handleSetPatchFind = useCallback((text: string) => {
    setPatches((current) => {
      if (current.length === 0) {
        return [{ localId: createUuid(), find: text, replace: '' }];
      }
      return current.map((item, i) => (i === 0 ? { ...item, find: text } : item));
    });
    setFocusAnchorLine(null);
  }, []);

  const handleFocusRangeClear = useCallback(() => {
    setFocusRange(null);
    setFocusAnchorLine(null);
    setFocusFile('');
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-mono font-semibold text-slate-400">STEP {stepIndex + 1}</span>
          <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
        </div>
        {hasStructuralChanges && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
            结构改动待保存
          </span>
        )}
      </div>

      {/* Prose fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Eyebrow</span>
          <input className={INPUT_CLASS} value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="例如：准备工作" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">标题</span>
          <input className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-slate-500">导语 (Lead)</span>
        <input className={`${INPUT_CLASS} italic text-slate-400`} value={lead} onChange={(e) => setLead(e.target.value)} placeholder="步骤的核心概括..." />
      </label>

      {/* Code + Patches grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        <CodePreviewPanel
          selectionMode={selectionMode}
          onSelectionModeChange={setSelectionMode}
          focusRange={visibleFocusRange}
          onFocusRangeClear={handleFocusRangeClear}
          focusFile={activeFocusFile}
          hasHiddenFocus={Boolean(focusRange && !visibleFocusRange)}
          markedLines={markedLines}
          markCount={visibleMarks.length}
          onMarkedLinesClear={() =>
            setMarks((current) =>
              current.filter((mark) => !visibleMarks.some((visible) => visible.localId === mark.localId))
            )
          }
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
        />

        <section className="space-y-3 rounded-lg bg-slate-50/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold text-slate-700">Patches</h4>
            <button
              type="button"
              className="inline-flex h-6 items-center justify-center rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
              onClick={() => setPatches((current) => [...current, { localId: createUuid(), find: '', replace: '' }])}
            >
              + 添加
            </button>
          </div>

          <div className="space-y-3">
            {patches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">
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
            focusRange={focusRange}
            setFocusRange={setFocusRange}
            focusFile={focusFile}
            setFocusFile={setFocusFile}
            previewFile={previewFile}
            hasHiddenFocus={Boolean(focusRange && !visibleFocusRange)}
            marks={marks}
            setMarks={setMarks}
            isMultiFile={isMultiFile}
            fileNames={fileNames}
          />
        </section>
      </div>

      {/* Markdown paragraphs */}
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-slate-500">讲解段落 (Markdown)</span>
        <MarkdownEditor value={paragraphs} onChange={setParagraphs} placeholder="支持 Markdown 语法" />
      </label>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? '保存中...' : '保存步骤'}
        </button>
        <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onRegenerate(step.id, regenMode)}
            disabled={saving}
          >
            {saving ? '正在处理...' : `重新生成${regenMode === 'prose' ? '文案' : '完整内容'}`}
          </button>
          <div className="mx-0.5 h-4 w-px bg-slate-200" />
          <select
            value={regenMode}
            onChange={(e) => setRegenMode(e.target.value as 'prose' | 'step')}
            className="h-8 bg-transparent px-2 text-xs font-medium text-slate-400 outline-none transition-colors hover:text-slate-600"
          >
            <option value="prose">仅文案</option>
            <option value="step">完整步骤</option>
          </select>
        </div>
      </div>
    </div>
  );
}
