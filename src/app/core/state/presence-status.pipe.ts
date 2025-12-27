import { Pipe, PipeTransform, inject } from '@angular/core';

import { PresenceStore } from './presence.store';
import { PresenceStatus } from '../../../api/presence/presence.dto';

@Pipe({
  name: 'presenceStatus',
  standalone: true
})
export class PresenceStatusPipe implements PipeTransform {
  private readonly presenceStore = inject(PresenceStore);

  transform(userId: string | null | undefined): PresenceStatus | 'UNKNOWN' {
    if (!userId) {
      return 'UNKNOWN';
    }
    return this.presenceStore.presence(userId);
  }
}
