'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, GripVertical, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { GenerationProgress } from '@/components/generation-progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ClientDraftRecord } from '@/lib/types/client';
import type { DraftGenerationMode } from '@/lib/types/generation-mode';
import { createUuid } from '@/lib/utils/uuid';
import {
  ensureOutlineChapters,
  validateOutlineChapterStructure,
} from '@/lib/tutorial/outline-chapters';
import { deriveChapterSections } from '@/lib/tutorial/chapters';
import { tutorialOutlineSchema, type OutlineStep, type TutorialOutline } from '@/lib/schemas/tutorial-outline';
import { buildGenerationContext } from './draft-workspace-utils';
import {
  fetchDraft,
  retryDraftFromStepRequest,
  updateDraftOutlineRequest,
} from './draft-client';

interface OutlineReviewWorkspaceProps {
  draft: ClientDraftRecord;
  startGeneration?: boolean;
  generationModelId?: string;
  generationMode?: DraftGenerationMode;
  recoveryStartStepIndex?: number;
}

function normalizeOutline(outline: TutorialOutline | null) {
  return outline ? ensureOutlineChapters(outline) : null;
}

function buildContinueUrl(
  draftId: string,
  modelId?: string
) {
  const params = new URLSearchParams({
    generate: '1',
    generationMode: 'fill_from_saved_outline',
  });
  if (modelId) {
    params.set('modelId', modelId);
  }
  return `/drafts/${draftId}?${params.toString()}`;
}

function buildOutlineUrl(
  draftId: string,
  modelId?: string
) {
  const params = new URLSearchParams({
    generate: '1',
    generationMode: 'outline_review',
  });
  if (modelId) {
    params.set('modelId', modelId);
  }
  return `/drafts/${draftId}/outline?${params.toString()}`;
}

export function OutlineReviewWorkspace({
  draft,
  startGeneration = false,
  generationModelId,
  generationMode = 'outline_review',
  recoveryStartStepIndex,
}: OutlineReviewWorkspaceProps) {
  const router = useRouter();
  const [draftState, setDraftState] = useState(draft);
  const [outlineState, setOutlineState] = useState<TutorialOutline | null>(
    normalizeOutline(draft.generationOutline)
  );
  const [saving, setSaving] = useState(false);
  const [showGenerationProgress, setShowGenerationProgress] = useState(
    startGeneration || draft.generationState === 'running'
  );
  const [generationRunNonce, setGenerationRunNonce] = useState(0);

  const generationContext = useMemo(
    () => buildGenerationContext(draftState),
    [draftState]
  );
  const normalizedOutline = useMemo(
    () => normalizeOutline(outlineState),
    [outlineState]
  );
  const sections = useMemo(
    () =>
      normalizedOutline
        ? deriveChapterSections(
            normalizedOutline.chapters,
            normalizedOutline.steps as any
          )
        : [],
    [normalizedOutline]
  );
  const effectiveModelId = generationModelId || draftState.generationModel || undefined;
  const scopedRecoveryStartIndex =
    typeof recoveryStartStepIndex === 'number' &&
    recoveryStartStepIndex >= 0 &&
    draftState.generationState === 'failed'
      ? recoveryStartStepIndex
      : null;
  const isScopedRecovery = scopedRecoveryStartIndex !== null;

  const validation = useMemo(() => {
    if (!outlineState) {
      return { valid: false, message: '请先生成大纲' };
    }
    const parsed = tutorialOutlineSchema.safeParse(outlineState);
    if (!parsed.success) {
      return { valid: false, message: parsed.error.issues[0]?.message || '大纲格式不合法' };
    }
    const chapterValidation = validateOutlineChapterStructure(outlineState);
    if (!chapterValidation.valid) {
      return {
        valid: false,
        message: chapterValidation.errors[0] || '章节与步骤结构不合法',
      };
    }
    return { valid: true, message: null as string | null };
  }, [outlineState]);

  function applyOutline(next: TutorialOutline) {
    setOutlineState(ensureOutlineChapters(next));
  }

  function getStepGlobalIndex(stepId: string) {
    if (!normalizedOutline) return -1;
    return normalizedOutline.steps.findIndex((step) => step.id === stepId);
  }

  function isLockedStep(stepId: string) {
    if (scopedRecoveryStartIndex === null) return false;
    const stepIndex = getStepGlobalIndex(stepId);
    return stepIndex !== -1 && stepIndex < scopedRecoveryStartIndex;
  }

  function updateChapter(chapterId: string, patch: { title?: string; description?: string }) {
    if (!normalizedOutline) return;
    applyOutline({
      ...normalizedOutline,
      chapters: normalizedOutline.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, ...patch } : chapter
      ),
    });
  }

  function addChapter() {
    if (!normalizedOutline) return;
    applyOutline({
      ...normalizedOutline,
      chapters: [
        ...normalizedOutline.chapters,
        {
          id: createUuid(),
          title: `新章节 ${normalizedOutline.chapters.length + 1}`,
          description: '',
          order: normalizedOutline.chapters.length,
        },
      ],
    });
  }

  function moveChapter(chapterId: string, direction: -1 | 1) {
    if (!normalizedOutline) return;
    const chapters = [...normalizedOutline.chapters].sort((a, b) => a.order - b.order);
    const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
    const targetIndex = currentIndex + direction;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= chapters.length) return;
    const reordered = [...chapters];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    applyOutline({
      ...normalizedOutline,
      chapters: reordered.map((chapter, index) => ({ ...chapter, order: index })),
    });
  }

  function deleteChapter(chapterId: string) {
    if (!normalizedOutline || normalizedOutline.chapters.length <= 1) return;
    const fallbackChapterId =
      normalizedOutline.chapters.find((chapter) => chapter.id !== chapterId)?.id ?? null;
    if (!fallbackChapterId) return;

    const chapters = normalizedOutline.chapters
      .filter((chapter) => chapter.id !== chapterId)
      .map((chapter, index) => ({ ...chapter, order: index }));

    const steps = normalizedOutline.steps.map((step) =>
      step.chapterId === chapterId ? { ...step, chapterId: fallbackChapterId } : step
    );

    applyOutline({
      ...normalizedOutline,
      chapters,
      steps,
    });
  }

  function updateStep(stepId: string, patch: Partial<OutlineStep>) {
    if (!normalizedOutline) return;
    applyOutline({
      ...normalizedOutline,
      steps: normalizedOutline.steps.map((step) =>
        step.id === stepId ? { ...step, ...patch } : step
      ),
    });
  }

  function addStep(chapterId: string) {
    if (!normalizedOutline) return;
    applyOutline({
      ...normalizedOutline,
      steps: [
        ...normalizedOutline.steps,
        {
          id: createUuid(),
          chapterId,
          title: `新步骤 ${normalizedOutline.steps.length + 1}`,
          teachingGoal: '',
          conceptIntroduced: '',
          estimatedLocChange: 4,
          targetFiles: [],
          contextFiles: [],
        },
      ],
    });
  }

  function deleteStep(stepId: string) {
    if (!normalizedOutline || normalizedOutline.steps.length <= 1) return;
    applyOutline({
      ...normalizedOutline,
      steps: normalizedOutline.steps.filter((step) => step.id !== stepId),
    });
  }

  function moveStepWithinChapter(stepId: string, direction: -1 | 1) {
    if (!normalizedOutline) return;
    const stepIndex = normalizedOutline.steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) return;
    const step = normalizedOutline.steps[stepIndex];
    const siblingIndexes = normalizedOutline.steps
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.chapterId === step.chapterId)
      .map(({ index }) => index);
    const siblingPosition = siblingIndexes.indexOf(stepIndex);
    const targetSiblingPosition = siblingPosition + direction;
    if (targetSiblingPosition < 0 || targetSiblingPosition >= siblingIndexes.length) return;
    const swapIndex = siblingIndexes[targetSiblingPosition];
    const nextSteps = [...normalizedOutline.steps];
    const [moved] = nextSteps.splice(stepIndex, 1);
    nextSteps.splice(swapIndex, 0, moved);
    applyOutline({
      ...normalizedOutline,
      steps: nextSteps,
    });
  }

  function moveStepToChapter(stepId: string, targetChapterId: string) {
    if (!normalizedOutline) return;
    const nextSteps = normalizedOutline.steps.map((step) =>
      step.id === stepId ? { ...step, chapterId: targetChapterId } : step
    );
    applyOutline({
      ...normalizedOutline,
      steps: nextSteps,
    });
  }

  async function reloadDraftState() {
    const nextDraft = await fetchDraft(draftState.id);
    setDraftState(nextDraft);
    setOutlineState(normalizeOutline(nextDraft.generationOutline));
    return nextDraft;
  }

  async function saveOutline() {
    if (!outlineState || !validation.valid) {
      alert(validation.message || '大纲还不能保存，请先修正');
      return null;
    }

    setSaving(true);
    try {
      const updated = await updateDraftOutlineRequest(draftState.id, outlineState);
      setDraftState(updated);
      setOutlineState(normalizeOutline(updated.generationOutline));
      return updated;
    } catch (error) {
      console.error('保存大纲失败:', error);
      alert(error instanceof Error ? error.message : '保存大纲失败，请重试');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function continueGeneration() {
    const updated = await saveOutline();
    if (!updated) return;

    if (scopedRecoveryStartIndex !== null) {
      setSaving(true);
      try {
        await retryDraftFromStepRequest(updated.id, {
          stepIndex: scopedRecoveryStartIndex,
          instruction:
            '你正在恢复一个在中途失败的教程。请保留失败步骤之前已经完成的教学节奏，只重新规划并生成当前失败步骤及其后续步骤。',
        });
        router.replace(`/drafts/${updated.id}`);
      } catch (error) {
        console.error('按失败路径继续生成失败:', error);
        alert(error instanceof Error ? error.message : '按失败路径继续生成失败，请重试');
      } finally {
        setSaving(false);
      }
      return;
    }

    router.push(buildContinueUrl(updated.id, effectiveModelId));
  }

  function startOutlineGeneration() {
    setShowGenerationProgress(true);
    setGenerationRunNonce((current) => current + 1);
    router.replace(buildOutlineUrl(draftState.id, effectiveModelId));
  }

  async function handleGenerationComplete() {
    try {
      const updated = await reloadDraftState();
      setShowGenerationProgress(false);
      if (updated.tutorialDraft) {
        router.replace(`/drafts/${updated.id}`);
        return;
      }
      router.replace(`/drafts/${updated.id}/outline`);
    } catch (error) {
      console.error('刷新大纲失败:', error);
      alert('大纲生成完成，但刷新失败，请手动刷新页面。');
      setShowGenerationProgress(false);
      router.replace(`/drafts/${draftState.id}/outline`);
    }
  }

  async function handleExitGenerationProgress() {
    try {
      const updated = await reloadDraftState();
      setShowGenerationProgress(false);
      if (updated.tutorialDraft) {
        router.replace(`/drafts/${updated.id}`);
        return;
      }
      router.replace(`/drafts/${updated.id}/outline`);
    } catch (error) {
      console.error('刷新大纲失败:', error);
      setShowGenerationProgress(false);
      router.replace(`/drafts/${draftState.id}/outline`);
    }
  }

  if (showGenerationProgress) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <GenerationProgress
          key={`${draftState.id}:${generationRunNonce}`}
          draftId={draftState.id}
          onComplete={() => void handleGenerationComplete()}
          onExit={() => void handleExitGenerationProgress()}
          context={generationContext}
          modelId={effectiveModelId}
          generationMode={generationMode}
          startNewGeneration={startGeneration || generationRunNonce > 0}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Outline Review
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">
            {isScopedRecovery
              ? `调整第 ${scopedRecoveryStartIndex + 1} 步后的生成路径`
              : normalizedOutline?.meta.title || draftState.teachingBrief.topic || '审阅教程大纲'}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {isScopedRecovery
              ? `前 ${scopedRecoveryStartIndex} 步会被保留。你现在只调整第 ${scopedRecoveryStartIndex + 1} 步及其后续路径，然后系统会只重跑这段尾部。`
              : '默认流程可以直接生成完整教程；这里用于需要先确认章节结构的场景。确认后会基于当前大纲继续生成 patch 教程。'}
          </p>
          {draftState.tutorialDraft && draftState.generationState === 'failed' && (
            <p className="max-w-3xl text-sm leading-6 text-amber-700">
              {isScopedRecovery
                ? '当前是失败尾部恢复模式。继续生成时会保留已完成步骤，只替换失败步骤及其后续内容。'
                : '当前是失败后的恢复编辑。保存并继续生成时，会丢弃现有的半成品步骤，改为基于当前大纲重新填充后续教程。'}
            </p>
          )}
          {validation.message && (
            <p className="text-sm text-amber-700">{validation.message}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isScopedRecovery && (
            <Button
              type="button"
              variant="outline"
              onClick={startOutlineGeneration}
              disabled={saving}
            >
              <RefreshCw className="h-4 w-4" />
              重新生成大纲
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveOutline()}
            disabled={saving || !outlineState || !validation.valid}
          >
            <Save className="h-4 w-4" />
            保存大纲
          </Button>
          <Button
            type="button"
            onClick={() => void continueGeneration()}
            disabled={saving || !outlineState || !validation.valid}
          >
            {isScopedRecovery ? '保存并继续失败路径' : '继续生成教程'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!normalizedOutline ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          <p className="text-base text-slate-900">当前还没有可审阅的大纲。</p>
          <p className="mt-2 text-sm">先生成一次 outline，再回来调整章节和步骤结构。</p>
          <div className="mt-4">
            <Button type="button" onClick={startOutlineGeneration}>
              生成大纲
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {sections.map((section, chapterIndex) => {
              const chapter = normalizedOutline.chapters.find((item) => item.id === section.id);
              if (!chapter) return null;
              const sectionSteps = section.stepIds
                .map((stepId) => normalizedOutline.steps.find((step) => step.id === stepId))
                .filter(Boolean) as Array<OutlineStep & { chapterId: string }>;

              return (
                <section key={chapter.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Chapter {chapterIndex + 1}
                        </p>
                        <Input
                          value={chapter.title}
                          onChange={(event) =>
                            updateChapter(chapter.id, { title: event.target.value })
                          }
                          placeholder="章节标题"
                          disabled={saving}
                        />
                      </div>
                      <Textarea
                        value={chapter.description || ''}
                        onChange={(event) =>
                          updateChapter(chapter.id, { description: event.target.value })
                        }
                        placeholder="章节说明（可选）"
                        rows={2}
                        disabled={saving}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isScopedRecovery && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => moveChapter(chapter.id, -1)}
                            disabled={chapterIndex === 0}
                          >
                            <ArrowLeft className="h-4 w-4" />
                            上移
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => moveChapter(chapter.id, 1)}
                            disabled={chapterIndex >= normalizedOutline.chapters.length - 1}
                          >
                            下移
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => addStep(chapter.id)}>
                            <Plus className="h-4 w-4" />
                            添加步骤
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => deleteChapter(chapter.id)}
                            disabled={normalizedOutline.chapters.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除章节
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {sectionSteps.map((step, stepIndex) => (
                      <div
                        key={step.id}
                        className={`rounded-xl border p-4 ${
                          isLockedStep(step.id)
                            ? 'border-slate-200 bg-slate-100 opacity-75'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <GripVertical className="h-4 w-4" />
                            Step {stepIndex + 1}
                            {isLockedStep(step.id) && (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                                已完成，锁定
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {!isScopedRecovery && (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => moveStepWithinChapter(step.id, -1)}
                                  disabled={stepIndex === 0}
                                >
                                  上移
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => moveStepWithinChapter(step.id, 1)}
                                  disabled={stepIndex >= sectionSteps.length - 1}
                                >
                                  下移
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteStep(step.id)}
                                  disabled={normalizedOutline.steps.length <= 1}
                                >
                                  删除
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3">
                          <div className="space-y-1.5">
                            <Label>步骤标题</Label>
                            <Input
                              value={step.title}
                              onChange={(event) =>
                                updateStep(step.id, { title: event.target.value })
                              }
                              disabled={saving || isLockedStep(step.id)}
                            />
                          </div>

                          <div className="grid gap-3 lg:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>教学目标</Label>
                              <Textarea
                                rows={3}
                                value={step.teachingGoal}
                                onChange={(event) =>
                                  updateStep(step.id, { teachingGoal: event.target.value })
                                }
                                disabled={saving || isLockedStep(step.id)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label>新概念</Label>
                              <Textarea
                                rows={3}
                                value={step.conceptIntroduced}
                                onChange={(event) =>
                                  updateStep(step.id, { conceptIntroduced: event.target.value })
                                }
                                disabled={saving || isLockedStep(step.id)}
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 lg:grid-cols-3">
                            <div className="space-y-1.5">
                              <Label>所属章节</Label>
                              <select
                                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                                value={step.chapterId}
                                onChange={(event) =>
                                  moveStepToChapter(step.id, event.target.value)
                                }
                                disabled={saving || isLockedStep(step.id)}
                              >
                                {normalizedOutline.chapters.map((chapterOption) => (
                                  <option key={chapterOption.id} value={chapterOption.id}>
                                    {chapterOption.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <Label>预估代码改动行数</Label>
                              <Input
                                type="number"
                                min={0}
                                max={20}
                                value={step.estimatedLocChange}
                                onChange={(event) =>
                                  updateStep(step.id, {
                                    estimatedLocChange: Number(event.target.value || 0),
                                  })
                                }
                                disabled={saving || isLockedStep(step.id)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label>目标文件</Label>
                              <Input
                                value={(step.targetFiles || []).join(', ')}
                                onChange={(event) =>
                                  updateStep(step.id, {
                                    targetFiles: event.target.value
                                      .split(',')
                                      .map((item) => item.trim())
                                      .filter(Boolean),
                                  })
                                }
                                placeholder="app.ts, store.ts"
                                disabled={saving || isLockedStep(step.id)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Outline Summary
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div>
                  <p className="font-medium text-slate-900">章节数</p>
                  <p>{normalizedOutline.chapters.length}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">步骤数</p>
                  <p>{normalizedOutline.steps.length}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">简介</p>
                  <p className="line-clamp-5 leading-6">
                    {normalizedOutline.intro.paragraphs.join(' ') || '未提供'}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">说明</p>
                  <p className="line-clamp-6 leading-6">
                    {normalizedOutline.meta.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-900">限制说明</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {isScopedRecovery ? (
                  <>
                    <li>第 {scopedRecoveryStartIndex + 1} 步之前的步骤已完成，当前只允许调整后续路径文案与目标文件。</li>
                    <li>确认继续后，系统会保留前面的步骤，只重跑失败步骤及其后续内容。</li>
                    <li>失败尾部恢复模式下，不再提供整份大纲重新生成入口。</li>
                  </>
                ) : (
                  <>
                    <li>这里调整的是章节和步骤结构，代码 patch 还没生成。</li>
                    <li>确认继续后，系统会基于当前大纲逐步生成教程内容。</li>
                    <li>教程生成出 patch 链后，结构性编辑会默认锁定。</li>
                  </>
                )}
              </ul>
              {!isScopedRecovery && (
                <div className="mt-4">
                  <Button type="button" variant="outline" className="w-full" onClick={addChapter}>
                    <Plus className="h-4 w-4" />
                    添加章节
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
