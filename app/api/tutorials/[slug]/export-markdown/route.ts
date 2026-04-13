import { NextResponse } from 'next/server';
import { getTutorialDraftForExport } from '@/lib/services/tutorial-queries';
import { exportTutorialAsMarkdown } from '@/lib/services/export-markdown';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const draft = await getTutorialDraftForExport(slug);
  if (!draft) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const markdown = exportTutorialAsMarkdown(draft);

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.md"`,
    },
  });
}
