/**
 * Canonical list of allowed analytics event types.
 * Shared between server-side analytics and the public events API route.
 */

export const ALLOWED_EVENT_TYPES = new Set([
  'tutorial_viewed',
  'tutorial_created',
  'cta_clicked',
  'onboarding_started',
  'onboarding_completed',
  'template_used',
  'explore_viewed',
  'generation_started',
  'generation_completed',
  'generation_failed',
]);
