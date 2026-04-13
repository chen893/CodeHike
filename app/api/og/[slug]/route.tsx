import { ImageResponse } from 'next/og';
import { getTutorialMetadata } from '@/lib/services/tutorial-queries';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const tutorial = await getTutorialMetadata(slug);

  const title = tutorial?.title || 'VibeDocs Tutorial';
  const description = tutorial?.description || '';
  const lang = tutorial?.lang || '';
  const stepCount = tutorial?.stepCount || 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0f172a',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#22d3ee',
              letterSpacing: '-0.02em',
            }}
          >
            VibeDocs
          </div>
          {lang && (
            <div
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#94a3b8',
                backgroundColor: 'rgba(148,163,184,0.15)',
                padding: '4px 16px',
                borderRadius: '999px',
              }}
            >
              {lang}
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: '56px',
            fontWeight: 800,
            color: '#f8fafc',
            lineHeight: 1.2,
            letterSpacing: '-0.03em',
            maxWidth: '900px',
            marginBottom: '24px',
          }}
        >
          {title}
        </div>

        {description && (
          <div
            style={{
              fontSize: '24px',
              color: '#94a3b8',
              lineHeight: 1.5,
              maxWidth: '800px',
              marginBottom: '40px',
            }}
          >
            {description.slice(0, 120)}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            marginTop: 'auto',
          }}
        >
          {stepCount > 0 && (
            <div
              style={{
                fontSize: '22px',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {stepCount} 步教程
            </div>
          )}
          <div
            style={{
              fontSize: '22px',
              color: '#475569',
            }}
          >
            vibedocs.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
