import { cause } from '@/types/common/error';

export class ServiceError extends Error {
  public cause: cause;

  constructor(message: string, cause: cause) {
    super(message);
    this.name = 'ServiceError';
    this.cause = cause;

    // Maintaining proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
