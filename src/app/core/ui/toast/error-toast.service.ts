import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class ErrorToastService {
  constructor(private readonly toast: ToastService) {}

  /**
   * Show a single error toast for the provided error (or message) and return the resolved message.
   * If the same error has already been handled, no additional toast is emitted.
   */
  toastError(error: unknown, fallback = 'Something went wrong'): string {
    const message = this.extractMessage(error, fallback);
    if (this.alreadyHandled(error)) {
      return message;
    }
    this.toast.error(message);
    this.markHandled(error);
    return message;
  }

  private extractMessage(error: unknown, fallback: string): string {
    if (!error) {
      return fallback;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof HttpErrorResponse) {
      const payload = error.error as unknown;
      if (
        payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof (payload as any).message === 'string'
      ) {
        return (payload as any).message;
      }
      if (typeof payload === 'string' && payload.trim()) {
        return payload;
      }
      if (error.message?.trim()) {
        return error.message;
      }
      const statusInfo = `${error.status || 'Request failed'}${
        error.statusText ? `: ${error.statusText}` : ''
      }`;
      return statusInfo || fallback;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof (error as any)?.message === 'string') {
      return (error as any).message as string;
    }
    return fallback;
  }

  private alreadyHandled(error: unknown): boolean {
    return !!(error && typeof error === 'object' && (error as any).__toastHandled);
  }

  private markHandled(error: unknown) {
    if (error && typeof error === 'object') {
      (error as any).__toastHandled = true;
    }
  }
}
