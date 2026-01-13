import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { EMPTY, Subscription, Subject, catchError, filter, forkJoin, of, tap } from 'rxjs';

import { NotificationApi } from '../../../api/notifications/notification.api';
import {
  NotificationResponse,
  NotificationStatus,
  NotificationType
} from '../../../api/notifications/notification.dto';
import { UserApi } from '../../../api/users/user.api';
import { UserDto } from '../../../api/users/user.dto';
import { ServerApi } from '../../../api/servers/server.api';
import { Server, ServerType } from '../../../api/servers/server.dto';
import { AuthStore } from './auth.store';
import { ToastService } from '../ui/toast/toast.service';
import { ErrorToastService } from '../ui/toast/error-toast.service';
import { environment } from '../../../environments/environment';
import { Client } from '@stomp/stompjs';

@Injectable({ providedIn: 'root' })
export class NotificationStore implements OnDestroy {
  private readonly api = inject(NotificationApi);
  private readonly userApi = inject(UserApi);
  private readonly serverApi = inject(ServerApi);
  private readonly authStore = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly errorToast = inject(ErrorToastService);
  private readonly router = inject(Router);

  private readonly notifications = signal<NotificationResponse[]>([]);
  readonly unread = computed(() =>
    this.notifications().filter((n) => n.status === NotificationStatus.UNREAD)
  );
  private readonly messageNotifications = new Subject<NotificationResponse>();
  readonly messageNotifications$ = this.messageNotifications.asObservable();

  private client?: Client;
  private reconnecting = false;
  private subs = new Subscription();
  private notifiedFailure = false;
  private readonly userCache = new Map<string, UserDto>();
  private readonly serverCache = new Map<string, Server>();
  private readonly processedIds = new Set<string>();

  constructor() {
    this.subs.add(
      this.authStore.user$.subscribe(() => {
        this.ensureActive(true);
      })
    );
    this.subs.add(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
        // only try to reconnect on navigation if we are currently disconnected
        if (!this.client || !this.client.connected) {
          this.ensureActive();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.subs.unsubscribe();
  }

  ensureActive(forceReconnect = false) {
    const user = this.authStore.snapshot;
    if (!user?.id) {
      this.disconnect();
      this.notifications.set([]);
      return;
    }

    if (forceReconnect || !this.client || !this.client.connected) {
      this.connect(user.id);
    }

    // Only fetch unread when bootstrapping or if we are not connected yet.
    if (!this.client || !this.client.connected) {
      this.fetchUnread(user.id);
    }
  }

  disconnect() {
    if (this.client) {
      try {
        this.client.deactivate();
      } catch {
        // ignore disconnect errors
      }
    }
    this.client = undefined;
  }

  markAsRead(id: string) {
    const user = this.authStore.snapshot;
    if (!user?.id) {
      return;
    }
    if(user?.id !== this.notifications().find((notification) => notification.id === id)?.recipientId) {
      return;
    }
    this.api.markAsRead(id, user.id).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) =>
            n.id === id
              ? { ...n, status: NotificationStatus.READ, readAt: new Date().toISOString() }
              : n
          )
        );
      },
      error: (err) => {
        this.errorToast.toastError(err, 'Could not mark notification as read');
      }
    });
  }

  private async connect(userId: string) {
    this.disconnect();

    try {
      const { Client } = await import('@stomp/stompjs');
      const sockModule = await import('sockjs-client');
      const SockJS = (sockModule as any).default || (sockModule as any);

      const client = new Client({
        webSocketFactory: () => new SockJS(this.resolveWsUrl()),
        connectHeaders: { 'user-id': userId },
        reconnectDelay: 10000,
        debug: () => {}
      });

      client.onConnect = () => {
        this.reconnecting = false;
        this.notifiedFailure = false;
        client.subscribe('/user/queue/notifications', (message) => {
          this.handleIncoming(message);
        });
        client.subscribe(`/topic/notifications.${userId}`, (message) => {
          this.handleIncoming(message);
        });
      };

      client.onStompError = (frame) => {
        this.errorToast.toastError(frame.headers['message'] || 'Notification socket error');
      };

      client.onWebSocketClose = () => {
        if (!this.reconnecting) {
          this.reconnecting = true;
          if (!this.notifiedFailure) {
            this.notifiedFailure = true;
          }
          setTimeout(() => this.ensureActive(true), 2000);
        }
      };

      client.activate();
      this.client = client;
    } catch (err) {
      this.errorToast.toastError(err, 'Could not load notification socket');
    }
  }

  private handleIncoming(message: any) {
    try {
      const payload = JSON.parse(message.body) as NotificationResponse;
      if (this.isDuplicate(payload.id)) {
        return;
      }
      this.upsert([payload]);
      if (payload.type === NotificationType.MESSAGE_RECEIVED) {
        this.messageNotifications.next(payload);
      }
      this.showToastWithDetails(payload);
      this.autoMarkRead(payload);
    } catch (err) {
      this.errorToast.toastError(err, 'Could not parse notification');
    }
  }

  private fetchUnread(userId: string) {
    this.api.getNotifications(userId, NotificationStatus.UNREAD).subscribe({
      next: (list) => {
        const fresh = list.filter((n) => !this.isDuplicate(n.id));
        this.upsert(fresh);
        fresh.forEach((n) => {
          this.showToastWithDetails(n);
          this.autoMarkRead(n);
        });
      },
      error: (err) => this.errorToast.toastError(err, 'Could not load notifications')
    });
  }

  private upsert(incoming: NotificationResponse[]) {
    this.warmCaches(incoming);
    this.notifications.update((current) => {
      const map = new Map<string, NotificationResponse>();
      current.forEach((n) => map.set(String(n.id), n));
      incoming.forEach((n) => map.set(String(n.id), n));
      // sort ascending so the newest appear last (bottom)
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }

  private autoMarkRead(notification: NotificationResponse) {
    const user = this.authStore.snapshot;
    if (!user?.id) {
      return;
    }
    if(user?.id !== notification?.recipientId) {
      return;
    }
    this.api.markAsRead(notification.id, user.id).subscribe({
      next: () => {
        this.removeNotification(notification.id);
      },
      error: (err) => {
        this.errorToast.toastError(err, 'Could not mark notification as read');
      }
    });
  }

  // Expose signals for consumers
  get notificationsSignal() {
    return this.notifications;
  }

  private warmCaches(list: NotificationResponse[]) {
    const senderIds = Array.from(new Set(list.map((n) => n.senderId).filter(Boolean)));
    const channelIds = Array.from(new Set(list.map((n) => n.channelId).filter(Boolean)));
    senderIds.forEach((id) => {
      this.fetchUser(id).pipe(catchError(() => of(null))).subscribe();
    });
    channelIds.forEach((id) => {
      this.fetchServer(id).pipe(catchError(() => of(null))).subscribe();
    });
  }

  private async showToastWithDetails(notification: NotificationResponse) {
    const user$ = notification.senderId ? this.fetchUser(notification.senderId) : of(null);
    const server$ = notification.channelId ? this.fetchServer(notification.channelId) : of(null);

    forkJoin({ user: user$, server: server$ })
      .pipe(
        catchError(() => of({ user: null, server: null })),
        filter(() => true),
        // tap for toast side-effect
        // eslint-disable-next-line rxjs/finnish
        // explicit function to keep types narrow
        // no switchMap needed; single emission
        // use map-like behavior inside tap
        tap(({ user, server }) => {
          const userLabel = user?.username || this.userLabel(notification.senderId);
          const channelLabel = this.channelLabelFromServer(server, notification.channelId);
          const preview =
            notification.text && notification.text.length > 80
              ? `${notification.text.slice(0, 80)}…`
              : notification.text;
          const label = `New message from ${userLabel} in ${channelLabel}: ${preview || ''}`.trim();
          this.toast.info(label, () => this.navigateToNotification(notification));
        })
      )
      .subscribe();
  }

  private userLabel(userId: string): string {
    if (!userId) return 'Unknown user';
    const cached = this.userCache.get(userId);
    if (cached) {
      return cached.username || userId;
    }
    return 'Unknown user';
  }

  private channelLabel(channelId: string): string {
    if (!channelId) return 'Chat';
    const cached = this.serverCache.get(channelId);
    if (cached) {
      if (cached.type === ServerType.DM) {
        return 'Direct message';
      }
      return cached.name || 'Group';
    }
    return 'Chat';
  }

  private channelLabelFromServer(server: Server | null, channelId: string | undefined): string {
    if (server) {
      if (server.type === ServerType.DM) {
        return 'Direct message';
      }
      return server.name || 'Group';
    }
    return this.channelLabel(channelId || '');
  }

  private fetchUser(userId: string) {
    if (!userId) {
      return of(null);
    }
    const cached = this.userCache.get(userId);
    if (cached) {
      return of(cached);
    }
    return this.userApi.getById(userId).pipe(
      tap((user) => {
        if (user) {
          this.userCache.set(userId, user);
        }
      }),
      catchError(() => of(null))
    );
  }

  private fetchServer(serverId: string) {
    if (!serverId) {
      return of(null);
    }
    const cached = this.serverCache.get(serverId);
    if (cached) {
      return of(cached);
    }
    return this.serverApi.getServer(serverId).pipe(
      tap((server) => {
        if (server) {
          this.serverCache.set(serverId, server);
        }
      }),
      catchError(() => of(null))
    );
  }

  private resolveWsUrl(): string {
    const configured = (environment as any).notificationWs as string | undefined;
    if (configured) {
      return configured;
    }
    const apiBase = (environment as any).apiBaseUrls?.notification as string | undefined;
    if (apiBase) {
      try {
        return new URL('/ws', apiBase).toString();
      } catch {
        // fall through
      }
    }
    return `${window.location.origin}/ws`;
  }

  private removeNotification(id: string) {
    this.notifications.update((list) => list.filter((n) => n.id !== id));
  }

  private isDuplicate(id: string): boolean {
    if (!id) {
      return false;
    }
    if (this.processedIds.has(id)) {
      return true;
    }
    this.processedIds.add(id);
    return false;
  }

  private navigateToNotification(notification: NotificationResponse) {
    if (notification.channelId) {
      void this.router.navigate(['/chats', notification.channelId]);
      return;
    }
    void this.router.navigate(['/chats']);
  }
}
