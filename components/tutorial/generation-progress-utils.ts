import type {
  OutlineData,
  StepTitles,
  V2Status,
} from './generation-progress-types';

export const shellClass =
  'relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md';
export const heroClass =
  'rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-sm';
export const cardClass =
  'rounded-lg border border-slate-200 bg-white p-5 shadow-sm';
export const softCardClass =
  'rounded-lg border border-slate-100 bg-slate-50/50 p-4';
export const mutedText = 'text-xs leading-5 text-slate-500';
export const titleClass = 'text-lg font-bold tracking-tight text-slate-900';
export const sectionLabel =
  'inline-flex w-fit items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400';
export const primaryButton =
  'inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';
export const secondaryButton =
  'inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';
export const progressListClass =
  'mt-4 max-h-[min(24rem,48vh)] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] sm:max-h-[min(28rem,52vh)]';

export function getV2Headline(status: V2Status, currentStepIndex: number, totalSteps: number) {
  if (status === 'connecting') {
    return {
      title: '准备中',
      detail: '正在启动生成流程...',
    };
  }

  if (status === 'generating-outline') {
    return {
      title: '设计教学路径',
      detail: '先规划大纲，再逐步填充内容。',
    };
  }

  if (status === 'outline-received') {
    return {
      title: '大纲已就绪',
      detail: '正在逐步生成每一步的内容。',
    };
  }

  if (status === 'filling-step') {
    return {
      title: `生成第 ${currentStepIndex + 1} / ${totalSteps} 步`,
      detail: '正在编写讲解和代码变化。',
    };
  }

  if (status === 'validating') {
    return {
      title: '校验中',
      detail: '内容已生成，正在检查完整性。',
    };
  }

  if (status === 'stream-complete') {
    return {
      title: '保存中',
      detail: '生成完成，正在保存并跳转。',
    };
  }

  if (status === 'reconnecting') {
    return {
      title: '等待生成完成',
      detail: '生成仍在进行中，页面将在完成后自动跳转。',
    };
  }

  return {
    title: '生成失败',
    detail: '生成中断，请检查错误信息后重试。',
  };
}

export function isIndeterminate(status: V2Status): boolean {
  return status === 'connecting' || status === 'generating-outline';
}

export function getProgressValue(
  status: V2Status,
  currentStepIndex: number,
  totalSteps: number,
  completedSteps: number[]
) {
  if (status === 'connecting') return 4;
  if (status === 'generating-outline') return 14;
  if (status === 'outline-received') return 20;
  if (status === 'validating' || status === 'stream-complete') return 96;
  if (status === 'reconnecting') return 50;
  if (status === 'error') {
    return totalSteps > 0 ? Math.min(96, (completedSteps.length / totalSteps) * 100) : 14;
  }

  if (status === 'filling-step' && totalSteps > 0) {
    return Math.max(20, Math.min(90, ((currentStepIndex + 1) / totalSteps) * 100));
  }

  return 8;
}

export function getDisplaySteps(
  outline: OutlineData | null,
  totalSteps: number,
  currentStepIndex: number,
  completedSteps: number[],
  status: V2Status,
  stepTitles: StepTitles
) {
  const count = outline?.steps.length ?? totalSteps;

  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const outlineStep = outline?.steps[index];
    const isCompleted =
      completedSteps.includes(index) ||
      (status !== 'error' && ['validating', 'stream-complete'].includes(status));
    const isCurrent = index === currentStepIndex && status === 'filling-step';
    const title =
      outlineStep?.title ||
      stepTitles[index] ||
      (isCurrent ? `步骤 ${index + 1} 生成中` : `步骤 ${index + 1}`);
    const meta = outlineStep
      ? `${outlineStep.teachingGoal} · ${outlineStep.conceptIntroduced}`
      : isCurrent
        ? '正在编写讲解和代码变化'
        : isCompleted
          ? '已完成'
          : '等待中';

    return {
      id: outlineStep?.id || `step-${index}`,
      index,
      title,
      meta,
      isCompleted,
      isCurrent,
    };
  });
}

export function getFocusStep(
  outline: OutlineData | null,
  currentStepIndex: number,
  totalSteps: number
) {
  if (!outline || outline.steps.length === 0) return null;

  if (currentStepIndex >= 0 && currentStepIndex < outline.steps.length) {
    return outline.steps[currentStepIndex];
  }

  if (totalSteps > 0) {
    return outline.steps[0] ?? null;
  }

  return null;
}

export function getErrorText(
  v2Status: V2Status,
  errorMessage: string | null
) {
  if (errorMessage) return errorMessage;
  if (v2Status === 'error') return '生成失败';
  return null;
}
