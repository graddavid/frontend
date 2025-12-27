import { Component, HostListener, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastContainerComponent } from './core/ui/toast/toast-container.component';
import { NotificationStore } from './core/state/notification.store';
import { PresenceStore } from './core/state/presence.store';
import { AuthStore } from './core/state/auth.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly notificationStore = inject(NotificationStore);
  private readonly presenceStore = inject(PresenceStore);
  private readonly authStore = inject(AuthStore);

  ngOnInit(): void {
    this.notificationStore.ensureActive();
    const user = this.authStore.snapshot;
    if (user?.id) {
      this.presenceStore.setOnline(user.id);
    }
  }

  @HostListener('window:beforeunload')
  handleUnload() {
    const user = this.authStore.snapshot;
    if (user?.id) {
      this.presenceStore.setOffline(user.id);
    }
  }
}
