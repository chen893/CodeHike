'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  FileStack,
  Globe2,
  Plus,
  Trash2,
} from 'lucide-react';
import { getDraftStatusInfo } from '@/lib/draft-status';
import type { ClientDraftSummary } from '@/lib/types/client';
import { Button } from '@/components/ui/button';
import { useDraftsPageController } from '@/components/drafts/use-drafts-page-controller';
import type { StatusVariant } from '@/lib/draft-status';

interface DraftsPageProps {
  drafts: ClientDraftSummary[];
}

const statusDotColor: Record<StatusVariant, string> = {
  generating: 'bg-status-generating-foreground shadow-[0_0_6px_var(--status-generating-foreground)]',
  done: 'bg-status-done-foreground',
  failed: 'bg-status-failed-foreground',
  draft: 'bg-status-draft-foreground',
  default: 'bg-primary',
};

const statusAccentColor: Record<StatusVariant, string> = {
  generating: 'bg-status-generating-foreground',
  done: 'bg-status-done-foreground',
  failed: 'bg-status-failed-foreground',
  draft: 'bg-status-draft-foreground',
  default: 'bg-primary',
};

function formatRelativeTime(value: string | Date) {
  const now = Date.now();
  const then = new Date(value).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function getDraftDescription(draft: ClientDraftSummary) {
  if (draft.validationErrors.length > 0) return draft.validationErrors[0];
  if (draft.generationErrorMessage) return draft.generationErrorMessage;
  return draft.baseDescription || '暂未生成内容';
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
    { drafts: [] as ClientDraftSummary[], published: [] as ClientDraftSummary[] },
  );
}

export function DraftsPage({ drafts: initialDrafts }: DraftsPageProps) {
  const { drafts, deletingId, handleDelete } = useDraftsPageController({ initialDrafts });
  const groups = partitionDrafts(drafts);

  return (
    <div className="min-h-screen">
      <div className="container-app max-w-5xl py-10">
        {/* Header */}
        <header className="mb-10">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
            // drafts
          </div>
          <div className="mt-2 flex items-end justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">草稿箱</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                管理你的教程草稿和已发布内容
              </p>
            </div>
            <Button asChild className="h-9 rounded-lg px-4 gap-2">
              <Link href="/new">
                <Plus className="h-3.5 w-3.5" />
                新建教程
              </Link>
            </Button>
          </div>
        </header>

        <DraftSection
          label="drafts"
          title="草稿中"
          icon={<FileStack className="h-3.5 w-3.5" />}
          drafts={groups.drafts}
          deletingId={deletingId}
          onDelete={handleDelete}
          emptyText="还没有草稿，点击上方按钮开始创建。"
        />

        <DraftSection
          label="published"
          title="已发布"
          icon={<Globe2 className="h-3.5 w-3.5" />}
          drafts={groups.published}
          deletingId={deletingId}
          onDelete={handleDelete}
          emptyText="发布草稿后，教程会出现在这里。"
        />
      </div>
    </div>
  );
}

function DraftSection({
  label,
  title,
  icon,
  drafts,
  deletingId,
  onDelete,
  emptyText,
}: {
  label: string;
  title: string;
  icon: ReactNode;
  drafts: ClientDraftSummary[];
  deletingId: string | null;
  onDelete: (draft: ClientDraftSummary) => Promise<void>;
  emptyText: string;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
          {icon}
          <span className="ml-1.5">// {label}</span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] text-muted-foreground/60">
          {drafts.length}
        </span>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-6 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <code className="rounded-md bg-muted px-3 py-1 font-mono text-[11px] text-muted-foreground">
              $ vibedocs create
            </code>
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => (
            <DraftRow
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

function DraftRow({
  draft,
  deleting,
  onDelete,
}: {
  draft: ClientDraftSummary;
  deleting: boolean;
  onDelete: (draft: ClientDraftSummary) => Promise<void>;
}) {
  const status = getDraftStatusInfo(draft);
  const canDelete = draft.status !== 'published' && draft.generationState !== 'running';
  const isGenerating = draft.generationState === 'running';

  return (
    <article className="group relative rounded-xl border border-border/60 bg-card/60 px-5 py-4 transition-all hover:border-border hover:bg-card/90 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Hover left accent bar */}
      <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-60 ${statusAccentColor[status.variant]}`} />

      <div className="flex items-start gap-4">
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotColor[status.variant]} ${isGenerating ? 'animate-pulse' : ''}`} />
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium leading-snug text-foreground">
                <Link href={`/drafts/${draft.id}`} className="transition-colors hover:text-primary">
                  {draft.title || '无标题草稿'}
                </Link>
              </h3>
              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                {getDraftDescription(draft)}
              </p>
            </div>

            {/* Meta + actions */}
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
                {draft.stepCount > 0 && (
                  <span>{draft.stepCount} 步</span>
                )}
                {draft.publishedSlug && (
                  <span className="max-w-[140px] truncate font-mono text-[10px]">/{draft.publishedSlug}</span>
                )}
                <span>{formatRelativeTime(draft.updatedAt)}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button asChild size="sm" className="h-7 rounded-md px-2.5 text-xs gap-1">
                  <Link href={`/drafts/${draft.id}`}>
                    {isGenerating ? '进度' : '编辑'}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>

                {draft.hasTutorialDraft && !isGenerating ? (
                  <Button asChild variant="secondary" size="sm" className="h-7 rounded-md px-2.5 text-xs">
                    <Link href={`/drafts/${draft.id}/preview`}>预览</Link>
                  </Button>
                ) : null}

                {draft.publishedSlug ? (
                  <Button asChild variant="outline" size="sm" className="h-7 rounded-md px-2.5 text-xs">
                    <Link href={`/${draft.publishedSlug}`}>阅读</Link>
                  </Button>
                ) : null}

                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void onDelete(draft)}
                    disabled={deleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
