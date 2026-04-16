import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { createDraft } from '@/lib/services/create-draft';
import { listDraftSummariesForDashboard } from '@/lib/services/draft-queries';
import { auth } from '@/auth';

// ---------------------------------------------------------------------------
// In-memory idempotency key store (single-instance sufficient)
// Maps idempotency key → { draftId, expiresAt }
// ---------------------------------------------------------------------------
const idempotencyStore = new Map<
  string,
  { draftId: string; expiresAt: number }
>();
const idempotencyInFlight = new Map<string, Promise<{ draftId: string }>>();

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore) {
    if (entry.expiresAt <= now) {
      idempotencyStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const drafts = await listDraftSummariesForDashboard(userId);
    return NextResponse.json(drafts);
  } catch (err) {
    console.error('获取草稿列表失败:', err);
    return NextResponse.json(
      { message: '获取草稿列表失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // Check idempotency key
    const rawIdempotencyKey = req.headers.get('Idempotency-Key')
      ?? req.headers.get('X-Idempotency-Key');
    const idempotencyKey = rawIdempotencyKey
      ? `${userId}:${rawIdempotencyKey.slice(0, 128)}`
      : null;

    if (idempotencyKey) {
      const cached = idempotencyStore.get(idempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json({ id: cached.draftId }, { status: 201 });
      }
      if (cached) {
        idempotencyStore.delete(idempotencyKey);
      }

      const inFlight = idempotencyInFlight.get(idempotencyKey);
      if (inFlight) {
        const draft = await inFlight;
        return NextResponse.json({ id: draft.draftId }, { status: 201 });
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const createPromise = createDraft({
      ...(body as Record<string, unknown>),
      userId,
    } as Parameters<typeof createDraft>[0])
      .then((draft) => ({ draftId: draft.id }))
      .finally(() => {
        if (idempotencyKey) {
          idempotencyInFlight.delete(idempotencyKey);
        }
      });

    if (idempotencyKey) {
      idempotencyInFlight.set(idempotencyKey, createPromise);
    }

    const draft = await createPromise;

    // Store idempotency key mapping on success
    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, {
        draftId: draft.draftId,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    return NextResponse.json({ id: draft.draftId }, { status: 201 });
  } catch (err) {
    console.error('创建草稿失败:', err);
    const message = getRouteErrorMessage(err, '创建草稿失败');
    const code = isRouteValidationError(err) ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    return NextResponse.json(
      { message, code },
      { status: code === 'VALIDATION_ERROR' ? 400 : 500 }
    );
  }
}
