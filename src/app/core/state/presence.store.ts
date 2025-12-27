import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { interval, switchMap, tap, catchError, of, Subscription, Observable } from 'rxjs';

import { PresenceApi } from '../../../api/presence/presence.api';
import { PresenceDto, PresenceStatus } from '../../../api/presence/presence.dto';

@Injectable({ providedIn: 'root' })
export class PresenceStore implements OnDestroy {
  private readonly api = inject(PresenceApi);
  private readonly presences = signal<Map<string, PresenceDto>>(new Map());
  private readonly tracked = new Set<string>();
  private readonly sub: Subscription;
  private currentOnlineId: string | null = null;

  constructor() {
    // poll every 10s
    this.sub = interval(10000)
      .pipe(
        switchMap(() => this.fetch()),
        catchError(() => of(null))
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  track(ids: string[]) {
    let added = false;
    ids.filter(Boolean).forEach((id) => {
      if (!this.tracked.has(id)) {
        this.tracked.add(id);
        added = true;
      }
    });
    if (added) {
      this.fetch().subscribe();
    }
  }

  setTracked(ids: string[]) {
    this.tracked.clear();
    ids.filter(Boolean).forEach((id) => this.tracked.add(id));
    this.fetch().subscribe();
  }

  setOnline(userId: string) {
    if (!userId) {
      return;
    }
    if (this.currentOnlineId && this.currentOnlineId !== userId) {
      this.setOffline(this.currentOnlineId);
    }
    this.currentOnlineId = userId;
    this.api
      .setOnline(userId)
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  setOffline(userId?: string) {
    const target = userId || this.currentOnlineId;
    if (!target) {
      return;
    }
    this.api
      .setOffline(target)
      .pipe(
        tap(() => {
          if (this.currentOnlineId === target) {
            this.currentOnlineId = null;
          }
          const map = new Map(this.presences());
          const existing = map.get(target);
          if (existing) {
            map.set(target, { ...existing, status: PresenceStatus.OFFLINE });
            this.presences.set(map);
          }
        }),
        catchError(() => of(null))
      )
      .subscribe();
  }

  presence(id: string): PresenceStatus | 'UNKNOWN' {
    return this.presences().get(id)?.status ?? 'UNKNOWN';
  }

  private fetch(): Observable<PresenceDto[]> {
    const ids = Array.from(this.tracked);
    if (!ids.length) {
      return of([]);
    }
    return this.api.getBulkPresence(ids).pipe(
      tap((list) => {
        const map = new Map(this.presences());
        list.forEach((p) => map.set(p.userId, p));
        this.presences.set(map);
      })
    );
  }
}
