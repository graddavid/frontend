import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { ChatsPageComponent } from './chats-page.component';
import { MembershipApi } from '../../../api/servers/membership.api';
import { ServerApi } from '../../../api/servers/server.api';
import { SearchApi } from '../../../api/search/search.api';
import { MessageApi } from '../../../api/messages/message.api';
import { UserApi } from '../../../api/users/user.api';
import { MediaApi } from '../../../api/media/media.api';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationStore } from '../../core/state/notification.store';
import { PresenceStore } from '../../core/state/presence.store';
import { ToastService } from '../../core/ui/toast/toast.service';
import { ErrorToastService } from '../../core/ui/toast/error-toast.service';
import { Server, ServerType } from '../../../api/servers/server.dto';
import { Message, MessageStatus } from '../../../api/messages/message.dto';
import { UserDto } from '../../../api/users/user.dto';

describe('ChatsPageComponent', () => {
  let fixture: ComponentFixture<ChatsPageComponent>;
  let component: ChatsPageComponent;
  let membershipApi: jasmine.SpyObj<MembershipApi>;
  let serverApi: jasmine.SpyObj<ServerApi>;
  let searchApi: jasmine.SpyObj<SearchApi>;
  let messageApi: jasmine.SpyObj<MessageApi>;
  let userApi: jasmine.SpyObj<UserApi>;
  let mediaApi: jasmine.SpyObj<MediaApi>;
  let authStore: { snapshot: UserDto | null; user$: any };
  let notificationStore: { messageNotifications$: any };
  let presenceStore: jasmine.SpyObj<PresenceStore>;
  let router: jasmine.SpyObj<Router>;
  let toast: jasmine.SpyObj<ToastService>;
  let errorToast: jasmine.SpyObj<ErrorToastService>;

  beforeEach(() => {
    membershipApi = jasmine.createSpyObj('MembershipApi', [
      'getServers',
      'getUsers',
      'addMember',
      'banMember',
      'removeMember'
    ]);
    serverApi = jasmine.createSpyObj('ServerApi', ['createServer', 'getServer']);
    searchApi = jasmine.createSpyObj('SearchApi', ['searchUsers', 'searchMessages']);
    messageApi = jasmine.createSpyObj('MessageApi', [
      'sendMessage',
      'getMessageById',
      'getMessagesForChannel'
    ]);
    userApi = jasmine.createSpyObj('UserApi', ['getById']);
    mediaApi = jasmine.createSpyObj('MediaApi', ['download']);
    authStore = { snapshot: { id: 'user-1', username: 'sam' }, user$: of(null) };
    notificationStore = { messageNotifications$: of() };
    presenceStore = jasmine.createSpyObj('PresenceStore', ['setOnline', 'setTracked', 'track']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    toast = jasmine.createSpyObj('ToastService', ['error', 'info', 'success']);
    errorToast = jasmine.createSpyObj('ErrorToastService', ['toastError']);

    TestBed.configureTestingModule({
      imports: [ChatsPageComponent],
      providers: [
        { provide: MembershipApi, useValue: membershipApi },
        { provide: ServerApi, useValue: serverApi },
        { provide: SearchApi, useValue: searchApi },
        { provide: MessageApi, useValue: messageApi },
        { provide: UserApi, useValue: userApi },
        { provide: MediaApi, useValue: mediaApi },
        { provide: AuthStore, useValue: authStore },
        { provide: NotificationStore, useValue: notificationStore },
        { provide: PresenceStore, useValue: presenceStore },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
        { provide: ToastService, useValue: toast },
        { provide: ErrorToastService, useValue: errorToast }
      ]
    });

    fixture = TestBed.createComponent(ChatsPageComponent);
    component = fixture.componentInstance;
  });

  it('creates a group chat and navigates to it', () => {
    const server: Server = { id: 'server-1', name: 'My Group', type: ServerType.GROUP };
    serverApi.createServer.and.returnValue(of(server));

    component.createForm.setValue({
      type: ServerType.GROUP,
      name: '  My Group  ',
      bio: '',
      userQuery: ''
    });

    component.createChat();

    expect(serverApi.createServer).toHaveBeenCalledWith(
      { name: 'My Group', type: ServerType.GROUP, profile: undefined },
      'user-1',
      undefined
    );
    expect(component.servers).toEqual([server]);
    expect(toast.success).toHaveBeenCalledWith('Chat created');
    expect(router.navigate).toHaveBeenCalledWith(['/chats', server.id]);
    expect(component.createPending).toBeFalse();
  });

  it('requires a selected user for DM creation', () => {
    component.createForm.setValue({
      type: ServerType.DM,
      name: 'DM Chat',
      bio: '',
      userQuery: ''
    });

    component.createChat();

    expect(serverApi.createServer).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Select a user to start a DM.');
  });

  it('sends a message and updates the local cache', () => {
    const message: Message = {
      id: 'msg-1',
      channelId: 'server-1',
      senderId: 'user-1',
      content: 'Hello',
      status: MessageStatus.SENT,
      readBy: [],
      dateSent: new Date().toISOString()
    };
    messageApi.sendMessage.and.returnValue(of(message));
    userApi.getById.and.returnValue(of({ id: 'user-1', username: 'sam' }));

    component.sendForm.setValue({ content: 'Hello' });

    component.sendMessage('server-1');

    const args = messageApi.sendMessage.calls.mostRecent().args;
    expect(args[0]).toEqual(
      jasmine.objectContaining({
        channelId: 'server-1',
        senderId: 'user-1',
        content: 'Hello'
      })
    );
    expect(args[1]).toEqual([]);
    expect(component.messages[0]).toEqual(message);
    expect(component.sendForm.controls.content.value).toBe('');
    expect(component.sendPending).toBeFalse();
    expect(component.selectedFiles.length).toBe(0);
    expect(userApi.getById).toHaveBeenCalledWith('user-1');
  });
});
