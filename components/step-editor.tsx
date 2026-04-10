'use client';

import { useEffect, useState } from 'react';
import { CodeMirrorEditor } from './code-mirror-editor';
import { MarkdownEditor } from './markdown-editor';
import {
  getStepCodePreview,
  summarizeCodeDiff,
} from '@/lib/tutorial/draft-code';
import { normalizeBaseCode } from '@/lib/tutorial/normalize';
import { createUuid } from '@/lib/utils/uuid';
import type {
  ContentMark,
  ContentPatch,
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

interface PatchDraft extends ContentPatch {
  localId: string;
  file?: string;
}

interface MarkDraft extends ContentMark {
  localId: string;
  file?: string;
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

  // Detect multi-file
  const baseCodeMeta = normalizeBaseCode(tutorialDraft.baseCode, tutorialDraft.meta);
  const isMultiFile = Object.keys(baseCodeMeta.files).length > 1;
  const fileNames = Object.keys(baseCodeMeta.files);
  const [previewFile, setPreviewFile] = useState(baseCodeMeta.primaryFile);

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

  const normalizedParagraphs = paragraphs
    .split('\n\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedPatches = normalizePatches(patches, isMultiFile);
  const normalizedMarks = normalizeMarks(marks, isMultiFile);
  const focus = focusFind.trim()
    ? { find: focusFind, ...(isMultiFile && focusFile ? { file: focusFile } : {}) }
    : null;

  const previewStep: TutorialStep = {
    ...step,
    eyebrow: eyebrow || undefined,
    title: title.trim() || step.title,
    lead: lead || undefined,
    paragraphs: normalizedParagraphs,
    patches: normalizedPatches.length > 0 ? normalizedPatches : undefined,
    focus,
    marks: normalizedMarks.length > 0 ? normalizedMarks : undefined,
  };

  const draftForPreview: TutorialDraft = {
    ...tutorialDraft,
    steps: tutorialDraft.steps.map((item, index) =>
      index === stepIndex ? previewStep : item
    ),
  };

  let previousCode = '';
  let currentCode = '';
  let previewError: string | null = null;
  let diffSummary = { added: 0, removed: 0, modified: 0 };

  try {
    const preview = getStepCodePreview(draftForPreview, stepIndex, previewStep);
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

  const originalStructureSignature = getStructureSignature(step);
  const currentStructureSignature = getStructureSignature({
    patches: normalizedPatches,
    focus,
    marks: normalizedMarks,
  });
  const hasStructuralChanges =
    originalStructureSignature !== currentStructureSignature;

  const saveDisabled =
    saving || !title.trim() || (hasStructuralChanges && !!previewError);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Step {stepIndex + 1} Editor
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-slate-900">
            {step.title}
          </h3>
          <p className="text-xs text-slate-500">
            编辑步骤的文案和代码变更。
          </p>
        </div>
        {hasStructuralChanges ? (
          <span className="inline-flex w-fit items-center rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 border border-amber-200">
            结构改动待保存
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Eyebrow</span>
          <input
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={eyebrow}
            onChange={(event) => setEyebrow(event.target.value)}
            placeholder="例如：准备工作"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700">标题</span>
          <input
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">导语 (Lead)</span>
        <input
          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 italic text-slate-600"
          value={lead}
          onChange={(event) => setLead(event.target.value)}
          placeholder="步骤的核心概括..."
        />
      </label>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">代码预览</h4>
              <p className="text-[10px] text-slate-500">上一步 vs 当前步骤。</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold">
              {isMultiFile && (
                <select
                  className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-600"
                  value={previewFile}
                  onChange={(e) => setPreviewFile(e.target.value)}
                >
                  {fileNames.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 border border-emerald-200">
                +{diffSummary.added}
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 border border-amber-200">
                ~{diffSummary.modified}
              </span>
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 border border-rose-200">
                -{diffSummary.removed}
              </span>
            </div>
          </div>

          {previewError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <strong className="block font-bold">Patch 预览失败</strong>
              <p className="mt-0.5 leading-5">{previewError}</p>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Before
              </span>
              <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
                <CodeMirrorEditor
                  value={previousCode}
                  language={isMultiFile ? previewFile.split('.').pop() || 'javascript' : tutorialDraft.meta.lang}
                  readOnly
                  height="220px"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                After
              </span>
              <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
                <CodeMirrorEditor
                  value={currentCode}
                  language={isMultiFile ? previewFile.split('.').pop() || 'javascript' : tutorialDraft.meta.lang}
                  readOnly
                  height="220px"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Patches</h4>
              <p className="text-[10px] text-slate-500">定义当前步骤的代码变更。</p>
            </div>
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() =>
                setPatches((current) => [
                  ...current,
                  { localId: createUuid(), find: '', replace: '' },
                ])
              }
            >
              + 添加 Patch
            </button>
          </div>

          <div className="space-y-3">
            {patches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white/50 px-4 py-6 text-center text-xs text-slate-400">
                当前步骤没有 patch
              </div>
            ) : null}

            {patches.map((patch, index) => (
              <div key={patch.localId} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patch {index + 1}</strong>
                  <div className="flex items-center gap-2">
                    {isMultiFile && (
                      <select
                        className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600"
                        value={patch.file || ''}
                        onChange={(e) =>
                          setPatches((current) =>
                            current.map((item) =>
                              item.localId === patch.localId
                                ? { ...item, file: e.target.value || undefined }
                                : item
                            )
                          )
                        }
                      >
                        <option value="">自动</option>
                        {fileNames.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors"
                      onClick={() =>
                        setPatches((current) =>
                          current.filter((item) => item.localId !== patch.localId)
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500">find</span>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono transition-colors focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                      value={patch.find}
                      onChange={(event) =>
                        setPatches((current) =>
                          current.map((item) =>
                            item.localId === patch.localId
                              ? { ...item, find: event.target.value }
                              : item
                          )
                        )
                      }
                      rows={4}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500">replace</span>
                    <textarea
                      className="flex min-h-[120px] w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono transition-colors focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                      value={patch.replace}
                      onChange={(event) =>
                        setPatches((current) =>
                          current.map((item) =>
                            item.localId === patch.localId
                              ? { ...item, replace: event.target.value }
                              : item
                          )
                        )
                      }
                      rows={6}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-900">Focus</h5>
              <div className="flex items-center gap-2">
                {isMultiFile && (
                  <select
                    className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600"
                    value={focusFile}
                    onChange={(e) => setFocusFile(e.target.value)}
                  >
                    <option value="">自动</option>
                    {fileNames.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => { setFocusFind(''); setFocusFile(''); }}
                >
                  清空
                </button>
              </div>
            </div>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono transition-colors focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
              value={focusFind}
              onChange={(event) => setFocusFind(event.target.value)}
              rows={3}
              placeholder="要高亮的代码片段"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-900">Marks</h5>
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() =>
                  setMarks((current) => [
                    ...current,
                    { localId: createUuid(), find: '', color: '#2563eb' },
                  ])
                }
              >
                + 添加 Mark
              </button>
            </div>

            <div className="space-y-3">
              {marks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white/50 px-4 py-4 text-center text-xs text-slate-400">
                  当前步骤没有 mark
                </div>
              ) : null}

              {marks.map((mark, index) => (
                <div key={mark.localId} className="space-y-3 rounded-md border border-slate-100 bg-slate-50/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mark {index + 1}</strong>
                    <div className="flex items-center gap-2">
                      {isMultiFile && (
                        <select
                          className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600"
                          value={mark.file || ''}
                          onChange={(e) =>
                            setMarks((current) =>
                              current.map((item) =>
                                item.localId === mark.localId
                                  ? { ...item, file: e.target.value || undefined }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="">自动</option>
                          {fileNames.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors"
                        onClick={() =>
                          setMarks((current) =>
                            current.filter((item) => item.localId !== mark.localId)
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500">find</span>
                      <textarea
                        className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono transition-colors focus:outline-none focus:ring-1 focus:ring-slate-400"
                        value={mark.find}
                        onChange={(event) =>
                          setMarks((current) =>
                            current.map((item) =>
                              item.localId === mark.localId
                                ? { ...item, find: event.target.value }
                                : item
                            )
                          )
                        }
                        rows={2}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500">颜色</span>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded border border-slate-200" style={{ backgroundColor: mark.color }} />
                        <input
                          className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                          type="text"
                          value={mark.color}
                          onChange={(event) =>
                            setMarks((current) =>
                              current.map((item) =>
                                item.localId === mark.localId
                                  ? { ...item, color: event.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="#2563eb"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <label className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">讲解段落 (Markdown)</span>
        <MarkdownEditor
          value={paragraphs}
          onChange={setParagraphs}
          placeholder="支持 Markdown 语法"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-slate-50 shadow-sm transition-colors hover:bg-slate-900/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saving ? '保存中...' : '保存步骤'}
        </button>
        <div className="flex items-center rounded-md border border-slate-200 bg-white p-1">
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onRegenerate(step.id, regenMode)}
            disabled={saving}
          >
            {saving ? '正在处理...' : `重新生成${regenMode === 'prose' ? '文案' : '完整内容'}`}
          </button>
          <div className="mx-1 h-4 w-px bg-slate-200" />
          <select
            value={regenMode}
            onChange={(event) => setRegenMode(event.target.value as 'prose' | 'step')}
            className="h-8 bg-transparent px-2 text-xs font-medium text-slate-600 outline-none transition-colors hover:text-slate-900"
          >
            <option value="prose">仅文案</option>
            <option value="step">完整步骤</option>
          </select>
        </div>
      </div>
    </div>
  );
}
