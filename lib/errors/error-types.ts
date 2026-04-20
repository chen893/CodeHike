import type { GenerationJobErrorCode } from '../schemas/generation-job';

// Re-export the canonical error code type so consumers don't need to import
// from the schema module directly.
export type { GenerationJobErrorCode };

// Error categories
export type PatchErrorType = 'patch_not_found' | 'patch_ambiguous' | 'patch_file_not_found'
export type GenerationErrorType = 'generation_outline_failed' | 'generation_step_failed' | 'generation_cancelled'
export type ValidationErrorType = 'validation_failed'
export type PublishErrorType = 'publish_not_fresh' | 'publish_invalid' | 'publish_not_found' | 'publish_slug_conflict'
export type GeneralErrorType = 'unknown'

export type VibeDocsErrorType = PatchErrorType | GenerationErrorType | ValidationErrorType | PublishErrorType | GeneralErrorType

/**
 * Maps each GenerationJobErrorCode to a recoverability hint.
 * Used by API routes to include `recoverability` in error responses,
 * and by frontend classifiers to avoid message-based guessing.
 */
export const ERROR_CODE_RECOVERABILITY: Record<GenerationJobErrorCode, 'retry_full' | 'retry_from_step' | 'none'> = {
  OUTLINE_GENERATION_FAILED: 'retry_full',
  STEP_GENERATION_FAILED: 'retry_from_step',
  PATCH_VALIDATION_FAILED: 'retry_from_step',
  DRAFT_VALIDATION_FAILED: 'retry_full',
  PERSIST_FAILED: 'retry_full',
  JOB_CANCELLED: 'retry_full',
  JOB_STALE: 'retry_full',
  MODEL_CAPABILITY_MISMATCH: 'none',
  SOURCE_IMPORT_RATE_LIMITED: 'retry_full',
  PREVIEW_BUILD_FAILED: 'retry_full',
  PUBLISH_SLUG_CONFLICT: 'none',
}

export interface PatchError {
  type: PatchErrorType
  message: string
  patchIndex?: number
  findText?: string
  availableFiles?: string[]
}

export interface GenerationError {
  type: GenerationErrorType
  message: string
  stepIndex?: number
  phase?: string
  errorCode?: GenerationJobErrorCode
  recoverability?: 'retry_full' | 'retry_from_step' | 'none'
}

export interface ValidationError {
  type: ValidationErrorType
  message: string
  stepIndex?: number
  errors?: string[]
}

export interface PublishError {
  type: PublishErrorType
  message: string
}

export interface UnknownError {
  type: 'unknown'
  message: string
  rawError?: string
}

export type ClassifiedError = PatchError | GenerationError | ValidationError | PublishError | UnknownError

/**
 * Structured error shape returned by generation-related API routes.
 * Frontend code should read `code` and `recoverability` instead of
 * parsing `message` text to decide recovery actions.
 */
export interface GenerationApiErrorResponse {
  code: GenerationJobErrorCode | 'GENERATION_FAILED' | 'UNAUTHORIZED'
  message: string
  recoverability: 'retry_full' | 'retry_from_step' | 'none'
}

/**
 * Thrown when a publish attempt fails because the slug is already taken.
 * This is the authoritative conflict signal — caught from the DB unique constraint violation.
 */
export class PublishSlugConflictError extends Error {
  public readonly code = 'PUBLISH_SLUG_CONFLICT' as const;
  constructor(slug: string) {
    super(`Slug "${slug}" is already taken`);
    this.name = 'PublishSlugConflictError';
  }
}

/**
 * Thrown when patch validation fails during step generation.
 * Signals that the AI model produced patches that could not be applied
 * to the current file state, even after auto-fix attempts.
 */
export class PatchValidationError extends Error {
  public readonly code = 'PATCH_VALIDATION_FAILED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PatchValidationError';
  }
}
