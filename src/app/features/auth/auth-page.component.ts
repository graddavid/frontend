import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { EMPTY, catchError, finalize, forkJoin, map, of, tap } from 'rxjs';

import { UserApi } from '../../../api/users/user.api';
import { AuthStore } from '../../core/state/auth.store';
import { LoginRequest, RegisterRequest } from '../../../api/users/user.dto';
import { ToastService } from '../../core/ui/toast/toast.service';
import { ErrorToastService } from '../../core/ui/toast/error-toast.service';
import { PresenceStore } from '../../core/state/presence.store';
import { HealthApi } from '../../../api/health/health.api';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.scss'
})
export class AuthPageComponent {

  private readonly fb = inject(FormBuilder);
  private readonly userApi = inject(UserApi);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly errorToast = inject(ErrorToastService);
  private readonly presenceStore = inject(PresenceStore);
  private readonly healthApi = inject(HealthApi);

  readonly user$ = this.authStore.user$;

  readonly loginForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  readonly registerForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    username: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(3)]]
  });

  loginPending = false;
  registerPending = false;
  errorMessage = '';

  logout() {
    this.authStore.clear();
    this.presenceStore.setOffline();
    this.router.navigate(['/auth']);
    this.toast.info('Signed out');
  }

  submitLogin() {
    if (this.loginPending) {
      return;
    }
    if (this.loginForm.invalid) {
      this.errorMessage = 'Username and password are required.';
      this.toast.error(this.errorMessage);
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loginPending = true;
    this.errorMessage = '';
    const payload: LoginRequest = this.loginForm.getRawValue();

    this.userApi.login(payload).pipe(
      tap((user) => {
        this.authStore.setUser(user);
        this.presenceStore.setOnline(user.id);
        this.runServiceHealthChecks();
      }),
      tap(() => this.router.navigate(['/chats'])),
      catchError((err) => {
        this.errorMessage = this.errorToast.toastError(err, 'Login failed');
        return EMPTY;
      }),
      finalize(() => (this.loginPending = false))
    )
    .subscribe();
  }

  submitRegister() {
    if (this.registerPending) {
      return;
    }
    if (this.registerForm.invalid) {
      this.errorMessage =
        'Please provide a valid email, username (min 2 chars) and password (min 3 chars).';
      this.toast.error(this.errorMessage);
      this.registerForm.markAllAsTouched();
      return;
    }

    this.registerPending = true;
    this.errorMessage = '';
    const payload: RegisterRequest = this.registerForm.getRawValue();

    this.userApi.register(payload).pipe(
      tap((user) => {
        this.authStore.setUser(user);
        this.presenceStore.setOnline(user.id);
      }),
      tap(() => this.router.navigate(['/chats'])),
      catchError((err) => {
        this.errorMessage = this.errorToast.toastError(err, 'Registration failed');
        return EMPTY;
      }),
      finalize(() => (this.registerPending = false))
    )
    .subscribe();
  }

  private runServiceHealthChecks() {
    const checks = [
      { label: 'User service', obs: this.healthApi.user() },
      { label: 'Server service', obs: this.healthApi.server() },
      { label: 'Membership service', obs: this.healthApi.membership() },
      { label: 'Message service', obs: this.healthApi.message() },
      { label: 'Presence service', obs: this.healthApi.presence() },
      { label: 'Notification service', obs: this.healthApi.notification() },
      { label: 'Encryption service', obs: this.healthApi.encryption() },
      { label: 'Media service', obs: this.healthApi.media() },
      { label: 'Search service', obs: this.healthApi.search() }
    ];

    forkJoin(
      checks.map(({ label, obs }) =>
        obs.pipe(
          tap(() => this.toast.success(`${label} healthy`)),
          map(() => ({ label, ok: true })),
          catchError((err) => {
            this.errorToast.toastError(err, `${label} health check failed`);
            return of({ label, ok: false });
          })
        )
      )
    ).subscribe();
  }
}
