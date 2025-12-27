import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'error' | 'info' | 'success';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  function: () => void
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this.toastsSubject.asObservable();
  private counter = 0;

  error(message: string, fn = () => {}) {
    this.push(message, 'error', fn);
  }

  info(message: string, fn = () => {}) {
    this.push(message, 'info', fn);
  }

  success(message: string, fn = () => {}) {
    this.push(message, 'success', fn);
  }

  dismiss(id: number) {
    this.toastsSubject.next(this.toastsSubject.value.filter((t) => t.id !== id));
  }

  private push(message: string, type: ToastType, fn = () => {}) {
    const toast: Toast = { id: ++this.counter, message, type, function: fn};
    this.toastsSubject.next([...this.toastsSubject.value, toast]);
    setTimeout(() => this.dismiss(toast.id), 3500);
  }
}
