import { ZodError } from 'zod';

export class RouteConflictError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'CONFLICT') {
    super(message);
    this.name = 'RouteConflictError';
    this.code = code;
  }
}

export function getRouteErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ZodError) {
    return JSON.stringify(err.issues, null, 2);
  }

  if (err instanceof RouteConflictError) {
    return err.message;
  }

  if (err instanceof Error && err.message) {
    if (err.message.toLowerCase().startsWith('validation:')) {
      return err.message.replace(/^validation:\s*/i, '');
    }

    if (err.message.toLowerCase().startsWith('conflict:')) {
      return err.message.replace(/^conflict:\s*/i, '');
    }

    return err.message;
  }

  return fallback;
}

export function isRouteValidationError(err: unknown) {
  if (err instanceof ZodError) return true;
  if (!(err instanceof Error)) return false;

  return err.message.toLowerCase().includes('validation');
}

export function isRouteConflictError(err: unknown) {
  if (err instanceof RouteConflictError) return true;
  if (!(err instanceof Error)) return false;
  return err.message.toLowerCase().startsWith('conflict:');
}

export function getRouteConflictCode(
  err: unknown,
  fallback = 'CONFLICT'
) {
  if (err instanceof RouteConflictError) {
    return err.code;
  }

  return fallback;
}
