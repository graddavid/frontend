import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '@app/core/state/auth.store';
import { PresenceStore } from '@app/core/state/presence.store';


type NavLink = {
  path: string;
  label: string;
  description: string;
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly presenceStore = inject(PresenceStore);

  readonly user$ = this.authStore.user$;
  readonly navLinks: NavLink[] = [
    { path: '/chats', label: 'Chats', description: 'DMs and group chats' }
  ];

  logout() {
    this.presenceStore.setOffline();
    this.authStore.clear();
    this.router.navigate(['/auth']);
  }
}
