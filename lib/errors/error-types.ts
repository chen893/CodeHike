// Error categories
export type PatchErrorType = 'patch_not_found' | 'patch_ambiguous' | 'patch_file_not_found'
export type GenerationErrorType = 'generation_outline_failed' | 'generation_step_failed' | 'generation_cancelled'
export type ValidationErrorType = 'validation_failed'
export type PublishErrorType = 'publish_not_fresh' | 'publish_invalid' | 'publish_not_found'
export type GeneralErrorType = 'unknown'

export type VibeDocsErrorType = PatchErrorType | GenerationErrorType | ValidationErrorType | PublishErrorType | GeneralErrorType

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
