import { NextResponse } from 'next/server';
import { getTutorialDraftForExport } from '@/lib/services/tutorial-queries';
import { exportTutorialAsHtml } from '@/lib/services/export-html';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const draft = await getTutorialDraftForExport(slug);
  if (!draft) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const html = exportTutorialAsHtml(draft);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.html"`,
    },
  });
}
