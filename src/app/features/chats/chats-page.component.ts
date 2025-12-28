import {
  EMPTY,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  filter,
  of,
  switchMap,
  tap
} from 'rxjs';

import { Component, OnDestroy, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MembershipApi } from '../../../api/servers/membership.api';
import { Server, ServerCreateRequest, ServerType } from '../../../api/servers/server.dto';
import { SearchApi } from '../../../api/search/search.api';
import { MessageSearchResult, UserSearchResult } from '../../../api/search/search.dto';
import { ServerApi } from '../../../api/servers/server.api';
import { MessageApi } from '../../../api/messages/message.api';
import { Message, MessageDto, MediaAttachment } from '../../../api/messages/message.dto';
import { UserApi } from '../../../api/users/user.api';
import { UserDto } from '../../../api/users/user.dto';
import { NotificationResponse } from '../../../api/notifications/notification.dto';
import { AuthStore } from '../../core/state/auth.store';
import { PresenceStore } from '../../core/state/presence.store';
import { NotificationStore } from '../../core/state/notification.store';
import { PresenceStatusPipe } from '../../core/state/presence-status.pipe';
import { ToastService } from '../../core/ui/toast/toast.service';
import { ErrorToastService } from '../../core/ui/toast/error-toast.service';
import { MediaApi } from '../../../api/media/media.api';

@Component({
  selector: 'app-chats-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, PresenceStatusPipe],
  templateUrl: './chats-page.component.html',
  styleUrl: './chats-page.component.scss'
})
export class ChatsPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly membershipApi = inject(MembershipApi);
  private readonly serverApi = inject(ServerApi);
  private readonly searchApi = inject(SearchApi);
  private readonly messageApi = inject(MessageApi);
  private readonly userApi = inject(UserApi);
  private readonly mediaApi = inject(MediaApi);
  private readonly authStore = inject(AuthStore);
  private readonly notificationStore = inject(NotificationStore);
  private readonly presenceStore = inject(PresenceStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly errorToast = inject(ErrorToastService);

  servers: Server[] = [];
  selectedServerId: string | null = null;

  members: string[] = [];
  membersLoading = false;
  private readonly userCache = new Map<string, { username: string; displayName?: string }>();
  private readonly serverCache = new Map<string, Server>();
  userLabels: Record<string, string> = {};
  dmNameOverrides: Record<string, string> = {};

  messages: Message[] = [];
  messagesLoading = false;
  messagesLastPage = false;
  messagesPage = 0;
  readonly pageSize = 20;
  private readonly messageCache = new Map<
    string,
    { messages: Message[]; page: number; lastPage: boolean; loading?: boolean }
  >();

  userResults: UserSearchResult[] = [];
  memberSearchResults: UserSearchResult[] = [];
  readonly ServerType = ServerType;

  loading = false;
  errorMessage = '';
  createOpen = false;
  createPending = false;
  searchingUsers = false;
  selectedUser: UserSearchResult | null = null;
  searchingMembers = false;
  addMemberPending = false;
  banPendingUserId: string | null = null;
  selectedMember: UserSearchResult | null = null;
  manageOpen = false;
  sendPending = false;
  searchDialogOpen = false;
  searchPending = false;
  searchResults: MessageSearchResult[] = [];
  searchError = '';
  private routeSub?: Subscription;
  private messageNotificationSub?: Subscription;
  private readonly pushedMessageIds = new Set<string>();
  selectedFiles: File[] = [];
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  readonly createForm = this.fb.nonNullable.group({
    type: [ServerType.GROUP, Validators.required],
    name: ['', Validators.required],
    bio: [''],
    userQuery: ['']
  });
  readonly memberForm = this.fb.nonNullable.group({
    userQuery: ['']
  });
  readonly sendForm = this.fb.nonNullable.group({
    content: ['', Validators.required]
  });
  readonly searchForm = this.fb.nonNullable.group({
    query: ['', Validators.required],
    channelId: [''],
    senderId: [''],
    dateFrom: [''],
    dateTo: ['']
  });

  ngOnInit(): void {
    this.loadServers();
    this.setupUserSearch();
    this.setupMemberSearch();
    this.routeSub = this.route.paramMap
      .pipe(distinctUntilChanged())
      .subscribe((params) => {
        this.selectedServerId = params.get('serverId');
        if (this.selectedServerId) {
          this.loadMembers(this.selectedServerId);
          const hasCache = this.syncActiveMessagesFromCache(this.selectedServerId);
          if (!hasCache) {
            this.loadMessages(this.selectedServerId, 0, false);
          }
        } else {
          this.members = [];
          this.presenceStore.setTracked([]);
          this.resetMessages();
        }
        this.resetMemberState();
      });
    this.messageNotificationSub = this.notificationStore.messageNotifications$
      .pipe(
        filter((n) => !!n?.messageId && !!n?.channelId),
        tap((notification) => this.handleIncomingMessageNotification(notification))
      )
      .subscribe();
  }

  downloadAttachment(media: MediaAttachment) {
    if (media.downloadUrl) {
      window.open(media.downloadUrl, '_blank', 'noopener');
      return;
    }
    if (!media.id) {
      this.toast.error('File cannot be downloaded.');
      return;
    }
    this.mediaApi.download(media.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = media.filename || 'file';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => this.errorToast.toastError(err, 'Could not download file')
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.messageNotificationSub?.unsubscribe();
  }

  openServer(serverId: string) {
    if (!serverId) {
      return;
    }
    void this.router.navigate(['/chats', serverId]);
  }

  trackByServerId(_: number, server: Server) {
    return server.id;
  }

  trackByUserId(_: number, userId: string) {
    return userId;
  }

  trackByMessageId(_: number, message: Message) {
    return message.id;
  }

  selectMemberCandidate(user: UserSearchResult) {
    this.selectedMember = user;
    this.memberForm.patchValue({ userQuery: user.username });
  }

  clearSelectedMember() {
    this.selectedMember = null;
  }

  toggleManage() {
    this.manageOpen = !this.manageOpen;
    if (!this.manageOpen) {
      this.resetMemberState();
    }
  }

  toggleCreatePopover() {
    this.createOpen = !this.createOpen;
    if (!this.createOpen) {
      this.resetCreateForm();
    }
  }

  openSearchDialog() {
    const channelId = this.selectedServerId;
    this.searchForm.reset({
      query: '',
      channelId: channelId ?? '',
      senderId: '',
      dateFrom: '',
      dateTo: ''
    });
    this.searchResults = [];
    this.searchError = '';
    this.searchDialogOpen = true;
  }

  closeSearchDialog() {
    this.searchDialogOpen = false;
  }

  submitSearch() {
    if (this.searchPending || this.searchForm.invalid) {
      return;
    }
    const { query, channelId, senderId, dateFrom, dateTo } = this.searchForm.getRawValue();
    const request = {
      query: query.trim(),
      channelId: channelId?.trim() || undefined,
      senderId: senderId?.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page: 0,
      size: 50
    };
    this.searchPending = true;
    this.searchError = '';
    this.searchApi
      .searchMessages(request)
      .pipe(
        tap((page) => {
          this.searchResults = page.content;
          const senderIds = page.content.map((r) => r.senderId);
          const channelIds = page.content.map((r) => r.channelId);
          this.fetchUsers(senderIds);
          channelIds.forEach((id) => this.fetchServer(id));
        }),
        catchError((err) => {
          this.searchError = err?.message || err?.error || 'Search failed';
          this.searchResults = [];
          return of({ content: [] } as any);
        }),
        finalize(() => (this.searchPending = false))
      )
      .subscribe();
  }

  setType(type: ServerType) {
    this.createForm.patchValue({ type });
    if (type === ServerType.DM && this.selectedUser && !this.createForm.controls.name.value) {
      this.createForm.patchValue({ name: this.composeDmName(this.selectedUser.username) });
    }
    if (type === ServerType.GROUP) {
      this.selectedUser = null;
      this.createForm.patchValue({ userQuery: '' });
    }
  }

  selectUser(user: UserSearchResult) {
    this.selectedUser = user;
    if (this.createForm.controls.type.value === ServerType.DM) {
      this.createForm.patchValue({ name: this.composeDmName(user.username) });
    }
  }

  clearSelectedUser() {
    this.selectedUser = null;
  }

  createChat() {
    const currentUser = this.authStore.snapshot;
    if (!currentUser?.id) {
      this.toast.error('You need to sign in first.');
      void this.router.navigate(['/auth']);
      return;
    }

    const { type, name, bio } = this.createForm.getRawValue();
    const dmUserId = type === ServerType.DM ? this.selectedUser?.id : undefined;
    if (type === ServerType.DM && !dmUserId) {
      this.toast.error('Select a user to start a DM.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      this.toast.error('Please provide a chat name.');
      return;
    }

    const payload: ServerCreateRequest = {
      name: trimmedName,
      type,
      profile: bio?.trim() ? { bio: bio.trim() } : undefined
    };

    console.log(currentUser.id, dmUserId);

    this.createPending = true;
    this.serverApi
      .createServer(payload, currentUser.id, dmUserId)
      .pipe(
        tap((server) => {
          this.servers.push(server);
          this.toast.success('Chat created');
          this.toggleCreatePopover();
          this.openServer(server.id);
          this.resetMessages();
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not create chat');
          return EMPTY;
        }),
        finalize(() => (this.createPending = false))
      )
      .subscribe();
  }

  addMember(serverId: string | null) {
    if (!serverId || this.addMemberPending) {
      return;
    }
    const candidateId = this.selectedMember?.id;
    if (!candidateId) {
      this.toast.error('Select a user to add.');
      return;
    }

    this.addMemberPending = true;
    this.membershipApi
      .addMember(candidateId, serverId)
      .pipe(
        tap(() => {
          this.toast.success('Member added');
          this.memberForm.patchValue({ userQuery: '' });
          this.memberSearchResults = [];
          this.selectedMember = null;
          this.loadMembers(serverId);
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not add member');
          return EMPTY;
        }),
        finalize(() => (this.addMemberPending = false))
      )
      .subscribe();
  }

  banMember(serverId: string | null, targetUserId: string) {
    if (!serverId || !targetUserId) {
      return;
    }
    const currentUser = this.authStore.snapshot;
    if (!currentUser?.id) {
      this.toast.error('You need to sign in first.');
      void this.router.navigate(['/auth']);
      return;
    }
    if (currentUser.id === targetUserId) {
      this.toast.error('You cannot ban yourself.');
      return;
    }

    this.banPendingUserId = targetUserId;
    this.membershipApi
      .banMember(currentUser.id, targetUserId, serverId)
      .pipe(
        tap(() => {
          this.toast.success('Member banned');
          this.loadMembers(serverId);
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not ban member');
          return EMPTY;
        }),
        finalize(() => (this.banPendingUserId = null))
      )
      .subscribe();
  }

  removeMember(serverId: string | null, targetUserId: string) {
    if (!serverId || !targetUserId) {
      return;
    }
    const currentUser = this.authStore.snapshot;
    if (!currentUser?.id) {
      this.toast.error('You need to sign in first.');
      void this.router.navigate(['/auth']);
      return;
    }
    if (currentUser.id === targetUserId) {
      this.toast.error('You cannot remove yourself.');
      return;
    }

    this.banPendingUserId = targetUserId;
    this.membershipApi
      .removeMember(currentUser.id, targetUserId, serverId)
      .pipe(
        tap(() => {
          this.toast.success('Member removed');
          this.loadMembers(serverId);
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not remove member');
          return EMPTY;
        }),
        finalize(() => (this.banPendingUserId = null))
      )
      .subscribe();
  }

  loadMoreMessages(serverId: string | null) {
    if (!serverId || this.messagesLoading || this.messagesLastPage) {
      return;
    }
    this.loadMessages(serverId, this.messagesPage + 1, true);
  }

  onMessagesScroll(event: Event, serverId: string | null) {
    const target = event.target as HTMLElement;
    const threshold = 150;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < threshold) {
      this.loadMoreMessages(serverId);
    }
  }

  isOwnMessage(message: Message) {
    return message.senderId === this.authStore.snapshot?.id;
  }

  get dmServers(): Server[] {
    return this.servers.filter((s) => s.type === ServerType.DM);
  }

  get groupServers(): Server[] {
    return this.servers.filter((s) => s.type === ServerType.GROUP);
  }

  get selectedServer(): Server | null {
    return this.servers.find((s) => s.id === this.selectedServerId) ?? null;
  }

  sendMessage(serverId: string | null) {
    if (!serverId) {
      return;
    }
    const currentUser = this.authStore.snapshot;
    if (!currentUser?.id) {
      this.toast.error('You need to sign in first.');
      void this.router.navigate(['/auth']);
      return;
    }
    if (this.sendPending) {
      return;
    }

    const content = this.sendForm.controls.content.value.trim();
    if (!content) {
      this.toast.error('Cannot send empty message.');
      return;
    }

    const payload: MessageDto = {
      channelId: serverId,
      senderId: currentUser.id,
      content,
      status: undefined,
      readBy: undefined
    };

    this.sendPending = true;
    const files = this.selectedFiles;
    this.messageApi
      .sendMessage(payload, files)
      .pipe(
        tap((message) => {
          this.messages = [message, ...this.messages];
          this.sendForm.reset({ content: '' });
          this.selectedFiles = [];
          if (this.fileInput?.nativeElement) {
            this.fileInput.nativeElement.value = '';
          }
          this.messageCache.set(serverId, {
            messages: this.messages,
            page: this.messagesPage,
            lastPage: this.messagesLastPage
          });
          this.fetchUsers([message.senderId]);
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not send message');
          return EMPTY;
        }),
        finalize(() => (this.sendPending = false))
      )
      .subscribe();
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const incoming = input.files ? Array.from(input.files) : [];
    if (!incoming.length) {
      return;
    }
    const merged = [...this.selectedFiles, ...incoming];
    // dedupe by name + size + lastModified to avoid double-adding the same file
    const seen = new Set<string>();
    this.selectedFiles = merged.filter((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // allow selecting the same file again after change
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  removeFile(index: number) {
    if (index < 0 || index >= this.selectedFiles.length) {
      return;
    }
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
    if (this.fileInput?.nativeElement) {
      const dataTransfer = new DataTransfer();
      this.selectedFiles.forEach((file) => dataTransfer.items.add(file));
      this.fileInput.nativeElement.files = dataTransfer.files;
      if (!this.selectedFiles.length) {
        this.fileInput.nativeElement.value = '';
      }
    }
  }

  private setupUserSearch() {
    this.createForm.controls.userQuery.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap(() => (this.searchingUsers = true)),
        switchMap((query) => {
          const trimmed = query?.trim();
          if (!trimmed) {
            this.userResults = [];
            this.searchingUsers = false;
            return of<UserSearchResult[]>([]);
          }
          return this.searchApi.searchUsers(trimmed).pipe(
            catchError((err) => {
              this.userResults = [];
              this.searchingUsers = false;
              this.errorToast.toastError(err, 'Could not search users');
              return of<UserSearchResult[]>([]);
            })
          );
        })
      )
      .subscribe((results) => {
        const filtered = this.filterOutCurrentUser(results);
        this.cacheUsers(filtered);
        this.userResults = filtered;
        this.searchingUsers = false;
      });
  }

  private setupMemberSearch() {
    this.memberForm.controls.userQuery.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap(() => {
          this.searchingMembers = true;
          this.selectedMember = null;
        }),
        switchMap((query) => {
          const trimmed = query?.trim();
          if (!trimmed) {
            this.memberSearchResults = [];
            this.searchingMembers = false;
            return of<UserSearchResult[]>([]);
          }
          return this.searchApi.searchUsers(trimmed).pipe(
            catchError((err) => {
              this.memberSearchResults = [];
              this.searchingMembers = false;
              this.errorToast.toastError(err, 'Could not search users');
              return of<UserSearchResult[]>([]);
            })
          );
        })
      )
      .subscribe((results) => {
        const filtered = this.filterOutCurrentUser(results);
        this.cacheUsers(filtered);
        this.memberSearchResults = filtered;
        this.searchingMembers = false;
      });
  }

  private loadServers() {
    const currentUser = this.authStore.snapshot;
    if (!currentUser?.id) {
      this.toast.error('You need to sign in to load your chats.');
      void this.router.navigate(['/auth']);
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.membershipApi
      .getServers(currentUser.id)
      .pipe(
        catchError((err) => {
          this.errorMessage = this.errorToast.toastError(err, 'Failed to load servers');
          return of<Server[]>([]);
        }),
        finalize(() => (this.loading = false))
      )
      .subscribe((servers) => {
        this.servers = servers.map((server) => this.normalizeServer(server));
        servers.forEach((s) => this.serverCache.set(s.id, s));
        this.hydrateDmNames(this.servers);
        this.preloadMessagesForServers(this.servers);
      });
  }

  private loadMembers(serverId: string) {
    this.membersLoading = true;
    this.membershipApi
      .getUsers(serverId)
      .pipe(
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not load members');
          return of<string[]>([]);
        }),
        finalize(() => (this.membersLoading = false))
      )
      .subscribe((members) => {
        this.members = members;
        this.fetchUsers(members);
        this.presenceStore.setTracked(members);
        const server = this.selectedServer;
        if (server && server.type === ServerType.DM) {
          this.updateDmName(server.id, members);
        }
      });
  }

  private loadMessages(
    serverId: string,
    page: number,
    append: boolean,
    options?: { showLoading?: boolean }
  ) {
    const cached = this.messageCache.get(serverId);
    if (cached?.loading) {
      return;
    }
    if (!append && page === 0 && cached?.messages.length) {
      if (this.selectedServerId === serverId) {
        this.syncActiveMessagesFromCache(serverId);
      }
      return;
    }

    const showLoading = options?.showLoading ?? this.selectedServerId === serverId;
    if (showLoading && this.selectedServerId === serverId) {
      this.messagesLoading = true;
    }

    this.messageCache.set(serverId, { ...(cached ?? { messages: [], page: 0, lastPage: false }), loading: true });
    this.messageApi
      .getMessagesForChannel(serverId, page, this.pageSize)
      .pipe(
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not load messages');
          return of({ content: [], last: true, number: page });
        }),
        finalize(() => {
          const entry = this.messageCache.get(serverId);
          if (entry) {
            this.messageCache.set(serverId, { ...entry, loading: false });
          }
          if (showLoading && this.selectedServerId === serverId) {
            this.messagesLoading = false;
          }
        })
      )
      .subscribe((result) => {
        const previous = this.messageCache.get(serverId)?.messages ?? [];
        const merged = append ? [...previous, ...result.content] : result.content;
        const last = result.last ?? result.content.length < this.pageSize;
        this.messageCache.set(serverId, { messages: merged, page, lastPage: last });
        if (this.selectedServerId === serverId) {
          this.messages = merged;
          this.messagesPage = page;
          this.messagesLastPage = last;
        }
        const senderIds = merged.map((m) => m.senderId);
        this.fetchUsers(senderIds);
        this.presenceStore.track(senderIds);
      });
  }

  private resetCreateForm() {
    this.createForm.reset({
      type: ServerType.GROUP,
      name: '',
      bio: '',
      userQuery: ''
    });
    this.selectedUser = null;
    this.searchingUsers = false;
    this.userResults = [];
  }

  private resetMemberState() {
    this.manageOpen = false;
    this.memberForm.reset({ userQuery: '' });
    this.searchingMembers = false;
    this.selectedMember = null;
    this.memberSearchResults = [];
  }

  private resetMessages() {
    this.messages = [];
    this.messagesPage = 0;
    this.messagesLastPage = false;
    this.messagesLoading = false;
  }

  private normalizeServer(server: Server): Server {
    const normalizedType =
      server.type === ServerType.DM || server.type === ServerType.GROUP
        ? server.type
        : (String(server.type || '').toUpperCase() as ServerType) || ServerType.GROUP;
    return { ...server, type: normalizedType };
  }

  userLabel(userId: string): string {
    return this.userLabels[userId] || userId;
  }

  getServerName(server: Server): string {
    if (server.type === ServerType.DM) {
      return this.dmNameOverrides[server.id] || server.name;
    }
    return server.name;
  }

  serverLabelById(id: string | null | undefined): string {
    if (!id) return '';
    if (this.dmNameOverrides[id]) {
      return this.dmNameOverrides[id];
    }
    const cached = this.serverCache.get(id);
    if (cached) {
      return cached.name;
    }
    return '';
  }

  private composeDmName(targetUsername: string | undefined): string {
    const currentUsername = this.authStore.snapshot?.username;
    if (currentUsername && targetUsername) {
      return `${currentUsername}-${targetUsername}`;
    }
    return targetUsername || '';
  }

  private cacheUsers(users: Array<UserSearchResult | UserDto>) {
    users.forEach((user) => {
      if (user?.id) {
        this.userCache.set(user.id, { username: user.username, displayName: (user as any).displayName });
        this.userLabels[user.id] = (user as any).displayName || user.username;
      }
    });
  }

  private fetchUsers(userIds: string[]) {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    const missing = unique.filter((id) => !this.userCache.has(id));
    missing.forEach((id) => {
      this.userApi.getById(id).subscribe({
        next: (user) => this.cacheUsers([user]),
        error: () => {
          // ignore fetch errors; we fall back to showing the id
        }
      });
    });
  }

  private filterOutCurrentUser<T extends { id: string }>(users: T[]): T[] {
    const currentUserId = this.authStore.snapshot?.id;
    if (!currentUserId) {
      return users;
    }
    return users.filter((u) => u.id !== currentUserId);
  }

  private hydrateDmNames(servers: Server[]) {
    const currentUser = this.authStore.snapshot;
    servers
      .filter((s) => s.type === ServerType.DM)
      .forEach((server) => {
        this.membershipApi
          .getUsers(server.id)
          .pipe(catchError(() => of<string[]>([])))
          .subscribe((members) => this.updateDmName(server.id, members));
      });
  }

  private updateDmName(serverId: string, members: string[]) {
    const currentUserId = this.authStore.snapshot?.id;
    const partnerId = members.find((m) => m !== currentUserId) || members[0];
    if (!partnerId) {
      return;
    }
    this.userApi.getById(partnerId).pipe(
      tap((user) => {
        this.cacheUsers([user]);
        const label = user?.username || partnerId;
        this.dmNameOverrides[serverId] = label;
      }),
      catchError(() => {
        this.dmNameOverrides[serverId] = partnerId;
        return EMPTY;
      })
    ).subscribe();
  }

  private handleIncomingMessageNotification(notification: NotificationResponse) {
    const { messageId, channelId } = notification;
    if (!messageId || !channelId) {
      return;
    }
    if (this.pushedMessageIds.has(messageId)) {
      return;
    }
    this.pushedMessageIds.add(messageId);
    this.messageApi
      .getMessageById(messageId)
      .pipe(
        tap((message) => {
          const cache = this.messageCache.get(channelId) ?? {
            messages: [],
            page: 0,
            lastPage: false
          };
          if (cache.messages.some((m) => m.id === message.id)) {
            return;
          }
          const updatedMessages = [message, ...cache.messages];
          const updatedEntry = {
            messages: updatedMessages,
            page: cache.page,
            lastPage: cache.lastPage
          };
          this.messageCache.set(channelId, updatedEntry);
          if (this.selectedServerId === channelId) {
            this.messages = updatedMessages;
            this.messagesPage = updatedEntry.page;
            this.messagesLastPage = updatedEntry.lastPage;
          }
          this.fetchUsers([message.senderId]);
          this.presenceStore.track([message.senderId]);
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not load new message');
          return EMPTY;
        }),
        finalize(() => this.pushedMessageIds.delete(messageId))
      )
      .subscribe();
  }

  fetchServer(id: string) {
    if (!id || this.serverCache.has(id)) {
      return;
    }
    this.serverApi.getServer(id).pipe(
      tap((s) => {
        this.serverCache.set(id, s);
        if (s.type === ServerType.DM) {
          this.dmNameOverrides[id] = s.name;
        }
      }),
      catchError(() => of(null))
    ).subscribe();
  }

  private preloadMessagesForServers(servers: Server[]) {
    servers
      .filter((server) => !!server.id)
      .forEach((server) => this.loadMessages(server.id, 0, false, { showLoading: false }));
  }

  private syncActiveMessagesFromCache(serverId: string): boolean {
    const cached = this.messageCache.get(serverId);
    if (!cached) {
      this.resetMessages();
      return false;
    }
    this.messages = cached.messages;
    this.messagesPage = cached.page;
    this.messagesLastPage = cached.lastPage;
    this.messagesLoading = false;
    const senderIds = cached.messages.map((m) => m.senderId);
    this.fetchUsers(senderIds);
    this.presenceStore.track(senderIds);
    return true;
  }
}
