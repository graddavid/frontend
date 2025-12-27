import {
  EMPTY,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  of,
  switchMap,
  tap
} from 'rxjs';

import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MembershipApi } from '../../../api/servers/membership.api';
import { Server, ServerCreateRequest, ServerType } from '../../../api/servers/server.dto';
import { SearchApi } from '../../../api/search/search.api';
import { UserSearchResult } from '../../../api/search/search.dto';
import { ServerApi } from '../../../api/servers/server.api';
import { MessageApi } from '../../../api/messages/message.api';
import { Message, MessageDto } from '../../../api/messages/message.dto';
import { AuthStore } from '../../core/state/auth.store';
import { ToastService } from '../../core/ui/toast/toast.service';
import { ErrorToastService } from '../../core/ui/toast/error-toast.service';

@Component({
  selector: 'app-chats-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './chats-page.component.html',
  styleUrl: './chats-page.component.scss'
})
export class ChatsPageComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly membershipApi = inject(MembershipApi);
  private readonly serverApi = inject(ServerApi);
  private readonly searchApi = inject(SearchApi);
  private readonly messageApi = inject(MessageApi);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly errorToast = inject(ErrorToastService);

  servers: Server[] = [];
  selectedServerId: string | null = null;

  members: string[] = [];
  membersLoading = false;

  messages: Message[] = [];
  messagesLoading = false;
  messagesLastPage = false;
  messagesPage = 0;
  readonly pageSize = 20;

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
  private routeSub?: Subscription;

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
          this.resetMessages();
          this.loadMessages(this.selectedServerId, 0, false);
        } else {
          this.members = [];
          this.resetMessages();
        }
        this.resetMemberState();
      });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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

  setType(type: ServerType) {
    this.createForm.patchValue({ type });
    if (type === ServerType.DM && this.selectedUser && !this.createForm.controls.name.value) {
      this.createForm.patchValue({ name: this.selectedUser.username });
    }
    if (type === ServerType.GROUP) {
      this.selectedUser = null;
      this.createForm.patchValue({ userQuery: '' });
    }
  }

  selectUser(user: UserSearchResult) {
    this.selectedUser = user;
    if (this.createForm.controls.type.value === ServerType.DM) {
      this.createForm.patchValue({ name: user.displayName || user.username });
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
    this.messageApi
      .sendMessage(payload)
      .pipe(
        tap((message) => {
          this.messages.push(message);
          this.sendForm.reset({ content: '' });
        }),
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not send message');
          return EMPTY;
        }),
        finalize(() => (this.sendPending = false))
      )
      .subscribe();
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
        this.userResults = results;
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
        this.memberSearchResults = results;
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
      .subscribe((members) => (this.members = members));
  }

  private loadMessages(serverId: string, page: number, append: boolean) {
    this.messagesLoading = true;
    this.messageApi
      .getMessagesForChannel(serverId, page, this.pageSize)
      .pipe(
        catchError((err) => {
          this.errorToast.toastError(err, 'Could not load messages');
          return of({ content: [], last: true, number: page });
        }),
        finalize(() => (this.messagesLoading = false))
      )
      .subscribe((result) => {
        const merged = append ? [...this.messages, ...result.content] : result.content;
        this.messages = merged;
        this.messagesPage = page;
        this.messagesLastPage = result.last ?? result.content.length < this.pageSize;
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
}
