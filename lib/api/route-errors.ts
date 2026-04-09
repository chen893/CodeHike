import { ZodError } from 'zod';

export function getRouteErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ZodError) {
    return JSON.stringify(err.issues, null, 2);
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}

export function isRouteValidationError(err: unknown) {
  if (err instanceof ZodError) return true;
  if (!(err instanceof Error)) return false;

  return err.message.toLowerCase().includes('validation');
}
