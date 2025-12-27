import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs';

import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss'
})
export class ToastContainerComponent {
  readonly toasts$ = this.toastService.toasts$.pipe(map((list) => list));

  constructor(private readonly toastService: ToastService) {}

  close(id: number) {
    this.toastService.dismiss(id);
  }

  invoke(toast: { id: number; function: () => void }) {
    try {
      toast.function();
    } finally {
      this.toastService.dismiss(toast.id);
    }
  }
}
