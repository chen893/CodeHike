import { NextResponse } from 'next/server';
import { trackEvent } from '@/lib/monitoring/analytics';
import { ALLOWED_EVENT_TYPES } from '@/lib/monitoring/event-types';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const eventType = body.eventType;
    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        { message: 'Invalid or missing eventType' },
        { status: 400 },
      );
    }

    await trackEvent({
      eventType,
      payload: body.payload ?? {},
      userId: body.userId,
      sessionId: body.sessionId,
      slug: body.slug,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[events] Failed to process event:', err);
    return NextResponse.json({ ok: true }); // Never fail client-side tracking
  }
}
