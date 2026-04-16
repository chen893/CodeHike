import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getGenerationStatus } from '@/lib/services/generate-tutorial-draft';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const lightweight = url.searchParams.get('lightweight') === 'true';

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { message: '请先登录', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const { draft, job } = await getGenerationStatus(id, session.user.id);

  if (!draft) {
    return NextResponse.json(
      { message: '草稿不存在', code: 'NOT_FOUND' },
      { status: 404 }
    );
  }

  if (!job) {
    return NextResponse.json({ job: null });
  }

  const {
    outlineSnapshot,
    stepTitlesSnapshot,
    ...lightweightJob
  } = job;

  return NextResponse.json({
    job: lightweight
      ? lightweightJob
      : {
          ...lightweightJob,
          outlineSnapshot,
          stepTitlesSnapshot,
        },
  });
}
