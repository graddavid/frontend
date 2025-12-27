import { Component } from '@angular/core';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  template: `<section class="notifications">
    <header class="page-header">
      <div>
        <p class="eyebrow">Notification service</p>
        <h1>Notifications</h1>
        <p class="hint">Notifications now appear as toasts across the app. This page will be removed.</p>
      </div>
    </header>
    <div class="panel">
      <p class="hint">Switch to chats or other pages; toasts will pop when new notifications arrive.</p>
    </div>
  </section>`,
  styleUrl: './notifications-page.component.scss'
})
export class NotificationsPageComponent {}
