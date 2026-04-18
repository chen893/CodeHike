/**
 * Server-side analytics event tracking.
 * Writes events to the `events` table for product analytics.
 * All tracking calls are fire-and-forget: failures are logged but never block the main flow.
 */

import { db } from '../db';
import { events } from '../db/schema';
import { ALLOWED_EVENT_TYPES } from './event-types';

export interface TrackEventInput {
  eventType: string;
  payload?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  slug?: string;
}

// Re-export for convenience
export { ALLOWED_EVENT_TYPES };

/**
 * Record an analytics event. Never throws.
 */
export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    if (!input.eventType || !ALLOWED_EVENT_TYPES.has(input.eventType)) {
      console.warn(`[analytics] Unknown event type: ${input.eventType}`);
      return;
    }
    await db.insert(events).values({
      eventType: input.eventType,
      payload: input.payload ?? {},
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      slug: input.slug ?? null,
    });
  } catch (err) {
    console.error('[analytics] Failed to record event:', input.eventType, err);
  }
}

/** Track a tutorial page view. */
export function trackTutorialViewed(
  slug: string,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  return trackEvent({
    eventType: 'tutorial_viewed',
    slug,
    userId,
    sessionId,
    payload: { source: 'published' },
  });
}

/** Track a successful tutorial generation. */
export function trackTutorialCreated(
  draftId: string,
  modelId: string,
  userId: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  return trackEvent({
    eventType: 'tutorial_created',
    userId,
    payload: { draftId, modelId, ...extra },
  });
}

/** Track a CTA click from the reading page. */
export function trackCtaClicked(
  ctaId: string,
  slug: string,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  return trackEvent({
    eventType: 'cta_clicked',
    slug,
    userId,
    sessionId,
    payload: { ctaId },
  });
}

/** Track an explore page view. */
export function trackExploreViewed(
  userId?: string,
  sessionId?: string,
  filters?: Record<string, string>,
): Promise<void> {
  return trackEvent({
    eventType: 'explore_viewed',
    userId,
    sessionId,
    payload: filters ?? {},
  });
}

/** Track a user profile page view. */
export function trackProfileViewed(
  username: string,
  userId?: string,
): Promise<void> {
  return trackEvent({
    eventType: 'profile_viewed',
    userId,
    payload: { username },
  });
}

/** Track a tag being viewed/clicked. */
export function trackTagViewed(
  tagSlug: string,
  source: 'explore' | 'tutorial_detail' | 'tag_page',
  userId?: string,
): Promise<void> {
  return trackEvent({
    eventType: 'tag_viewed',
    slug: tagSlug,
    userId,
    payload: { source },
  });
}

/** Track tags being assigned to a tutorial. */
export function trackTutorialTagged(
  tutorialId: string,
  tagNames: string[],
  userId?: string,
): Promise<void> {
  return trackEvent({
    eventType: 'tutorial_tagged',
    userId,
    payload: { tutorialId, tagNames },
  });
}
