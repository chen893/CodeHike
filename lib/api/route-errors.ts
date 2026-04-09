import { ZodError } from 'zod';

export function getRouteErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ZodError) {
    return JSON.stringify(err.issues, null, 2);
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
