import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { Router } from '@angular/router';

import { NotificationStore } from './notification.store';
import { NotificationApi } from '../../../api/notifications/notification.api';
import { UserApi } from '../../../api/users/user.api';
import { ServerApi } from '../../../api/servers/server.api';
import { AuthStore } from './auth.store';
import { ToastService } from '../ui/toast/toast.service';
import { ErrorToastService } from '../ui/toast/error-toast.service';
import {
  NotificationResponse,
  NotificationStatus,
  NotificationType
} from '../../../api/notifications/notification.dto';
import { ServerType } from '../../../api/servers/server.dto';
import { UserDto } from '../../../api/users/user.dto';

describe('NotificationStore', () => {
  let api: jasmine.SpyObj<NotificationApi>;
  let userApi: jasmine.SpyObj<UserApi>;
  let serverApi: jasmine.SpyObj<ServerApi>;
  let toast: jasmine.SpyObj<ToastService>;
  let errorToast: jasmine.SpyObj<ErrorToastService>;
  let router: jasmine.SpyObj<Router>;
  let authStore: { user$: any; snapshot: UserDto | null };

  beforeEach(() => {
    api = jasmine.createSpyObj('NotificationApi', ['markAsRead', 'getNotifications']);
    userApi = jasmine.createSpyObj('UserApi', ['getById']);
    serverApi = jasmine.createSpyObj('ServerApi', ['getServer']);
    toast = jasmine.createSpyObj('ToastService', ['info']);
    errorToast = jasmine.createSpyObj('ErrorToastService', ['toastError']);
    router = jasmine.createSpyObj('Router', ['navigate'], { events: new Subject() });
    authStore = { user$: of(null), snapshot: null };

    TestBed.configureTestingModule({
      providers: [
        NotificationStore,
        { provide: NotificationApi, useValue: api },
        { provide: UserApi, useValue: userApi },
        { provide: ServerApi, useValue: serverApi },
        { provide: AuthStore, useValue: authStore },
        { provide: ToastService, useValue: toast },
        { provide: ErrorToastService, useValue: errorToast },
        { provide: Router, useValue: router }
      ]
    });
  });

  it('emits message notifications and caches incoming payloads', () => {
    const store = TestBed.inject(NotificationStore);
    authStore.snapshot = { id: 'user-3', username: 'rory' };
    const sender = { id: 'user-2', username: 'lee' };
    const server = { id: 'server-1', name: 'General', type: ServerType.GROUP };
    userApi.getById.and.returnValue(of(sender));
    serverApi.getServer.and.returnValue(of(server));

    const notification: NotificationResponse = {
      id: 'notif-1',
      recipientId: 'user-1',
      senderId: 'user-2',
      channelId: 'server-1',
      type: NotificationType.MESSAGE_RECEIVED,
      status: NotificationStatus.UNREAD,
      text: 'Hello',
      messageId: 'msg-1',
      createdAt: new Date().toISOString(),
      readAt: null
    };

    let received: NotificationResponse | null = null;
    store.messageNotifications$.subscribe((payload) => (received = payload));

    (store as any).handleIncoming({ body: JSON.stringify(notification) });

    expect(received!?.id).toBe(notification.id);
    expect(store.notificationsSignal().length).toBe(1);
    expect(toast.info).toHaveBeenCalled();
    const toastMessage = toast.info.calls.mostRecent().args[0] as string;
    expect(toastMessage).toContain('lee');
    expect(toastMessage).toContain('General');
  });

  it('marks notifications as read when recipient matches', () => {
    const store = TestBed.inject(NotificationStore);
    authStore.snapshot = { id: 'user-1', username: 'sam' };
    api.markAsRead.and.returnValue(of(void 0));

    const notification: NotificationResponse = {
      id: 'notif-2',
      recipientId: 'user-1',
      senderId: 'user-2',
      channelId: 'server-1',
      type: NotificationType.MESSAGE_RECEIVED,
      status: NotificationStatus.UNREAD,
      text: 'Hello',
      messageId: 'msg-2',
      createdAt: new Date().toISOString(),
      readAt: null
    };

    store.notificationsSignal.set([notification]);
    store.markAsRead(notification.id);

    expect(api.markAsRead).toHaveBeenCalledWith(notification.id, 'user-1');
    const updated = store.notificationsSignal().find((item) => item.id === notification.id);
    expect(updated?.status).toBe(NotificationStatus.READ);
    expect(updated?.readAt).toBeTruthy();
  });

  it('does not mark notifications for other recipients', () => {
    const store = TestBed.inject(NotificationStore);
    authStore.snapshot = { id: 'user-9', username: 'sam' };
    api.markAsRead.and.returnValue(of(void 0));

    const notification: NotificationResponse = {
      id: 'notif-3',
      recipientId: 'user-1',
      senderId: 'user-2',
      channelId: 'server-1',
      type: NotificationType.MESSAGE_RECEIVED,
      status: NotificationStatus.UNREAD,
      text: 'Hello',
      messageId: 'msg-3',
      createdAt: new Date().toISOString(),
      readAt: null
    };

    store.notificationsSignal.set([notification]);
    store.markAsRead(notification.id);

    expect(api.markAsRead).not.toHaveBeenCalled();
  });
});
