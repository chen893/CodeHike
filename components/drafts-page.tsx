'use client';

import Link from 'next/link';
import { getDraftStatusInfo } from '@/lib/draft-status';
import type { ClientDraftSummary } from '@/lib/types/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDraftsPageController } from '@/components/drafts/use-drafts-page-controller';

interface DraftsPageProps {
  drafts: ClientDraftSummary[];
}

function formatUpdatedAt(value: string | Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getDraftTitle(draft: ClientDraftSummary) {
  return draft.title;
}

function getDraftDescription(draft: ClientDraftSummary) {
  if (draft.validationErrors.length > 0) {
    return draft.validationErrors[0];
  }

  if (draft.generationErrorMessage) {
    return draft.generationErrorMessage;
  }

  return (
    draft.baseDescription || '还没有生成内容。'
  );
}

function partitionDrafts(drafts: ClientDraftSummary[]) {
  return drafts.reduce(
    (groups, draft) => {
      if (draft.status === 'published') {
        groups.published.push(draft);
      } else {
        groups.drafts.push(draft);
      }

      return groups;
    },
    {
      drafts: [] as ClientDraftSummary[],
      published: [] as ClientDraftSummary[],
    }
  );
}

export function DraftsPage({ drafts: initialDrafts }: DraftsPageProps) {
  const { drafts, deletingId, handleDelete } = useDraftsPageController({ initialDrafts });
  const groups = partitionDrafts(drafts);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">草稿箱</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              管理你的草稿和已发布教程。
            </p>
          </div>
          <Button asChild>
            <Link href="/new">创建新教程</Link>
          </Button>
        </CardContent>
      </Card>

      <DraftSection
        title="草稿中"
        description="未发布的草稿，可以继续编辑。"
        drafts={groups.drafts}
        deletingId={deletingId}
        onDelete={handleDelete}
      />

      <DraftSection
        title="已发布"
        description="已经发布、可以阅读的教程。"
        drafts={groups.published}
        deletingId={deletingId}
        onDelete={handleDelete}
      />
    </div>
  );
}

function DraftSection({
  title,
  description,
  drafts,
  deletingId,
  onDelete,
}: {
  title: string;
  description: string;
  drafts: ClientDraftSummary[];
  deletingId: string | null;
  onDelete: (draft: ClientDraftSummary) => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700">
          {drafts.length}
        </span>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          <p>还没有内容</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              deleting={deletingId === draft.id}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DraftCard({
  draft,
  deleting,
  onDelete,
}: {
  draft: ClientDraftSummary;
  deleting: boolean;
  onDelete: (draft: ClientDraftSummary) => Promise<void>;
}) {
  const status = getDraftStatusInfo(draft);
  const stepCount = draft.stepCount;
  const canDelete =
    draft.status !== 'published' && draft.generationState !== 'running';

  return (
    <Card className="border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-lg">{getDraftTitle(draft)}</CardTitle>
              <Badge variant={status.variant}>
                {status.label}
              </Badge>
            </div>

            <p className="text-sm text-slate-500">
              {formatUpdatedAt(draft.updatedAt)} · {stepCount} 步
              {draft.publishedSlug ? ` · /${draft.publishedSlug}` : ''}
            </p>

            <CardDescription className="max-w-3xl text-sm leading-6 text-slate-600">
              {getDraftDescription(draft)}
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={`/drafts/${draft.id}`}>编辑</Link>
            </Button>

            {draft.hasTutorialDraft ? (
              <Button asChild variant="secondary">
                <Link href={`/drafts/${draft.id}/preview`}>预览</Link>
              </Button>
            ) : null}

            {draft.publishedSlug ? (
              <Button asChild>
                <Link href={`/${draft.publishedSlug}`}>阅读已发布</Link>
              </Button>
            ) : null}

            {canDelete ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  void onDelete(draft);
                }}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '删除'}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
