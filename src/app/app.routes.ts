import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell/shell.component';
import { AuthPageComponent } from './features/auth/auth-page.component';
import { ChatsPageComponent } from './features/chats/chats-page.component';
import { authGuard } from './core/state/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    component: AuthPageComponent
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'chats',
        pathMatch: 'full'
      },
      {
        path: 'chats/:serverId',
        component: ChatsPageComponent
      },
      {
        path: 'chats',
        component: ChatsPageComponent
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
