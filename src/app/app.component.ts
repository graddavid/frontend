import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastContainerComponent } from './core/ui/toast/toast-container.component';
import { NotificationStore } from './core/state/notification.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly notificationStore = inject(NotificationStore);

  ngOnInit(): void {
    this.notificationStore.ensureActive();
  }
}
