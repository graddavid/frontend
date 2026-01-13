import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { EMPTY, catchError, finalize, forkJoin, map, of, tap } from 'rxjs';

import { UserApi } from '../../../api/users/user.api';
import { AuthStore } from '../../core/state/auth.store';
import { LoginRequest, RegisterRequest, WalletLoginRequest, WalletRegisterRequest } from '../../../api/users/user.dto';
import { ToastService } from '../../core/ui/toast/toast.service';
import { ErrorToastService } from '../../core/ui/toast/error-toast.service';
import { PresenceStore } from '../../core/state/presence.store';
import { HealthApi } from '../../../api/health/health.api';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
    };
  }
}

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

  readonly walletUsernameForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(2)]]
  });

  loginPending = false;
  registerPending = false;
  walletPending = false;
  walletNeedsUsername = false;
  errorMessage = '';

  private walletAddress = '';
  private walletSignature = '';
  private walletMessage = '';

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

  // wallet auth

  async connectWallet() {
    if (!window.ethereum) {
      this.errorMessage = 'Metamask is not installed. Install Metamask to continue.';
      this.toast.error(this.errorMessage);
      return;
    }

    this.walletPending = true;
    this.errorMessage = '';

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      this.walletAddress = accounts[0];

      const nonce = Date.now();
      this.walletMessage = `Sign in to Adaran\nNonce: ${nonce}`;

      this.walletSignature = await window.ethereum.request({
        method: 'personal_sign',
        params: [this.walletMessage, this.walletAddress]
      });
      const payload: WalletLoginRequest = {
        walletAddress: this.walletAddress,
        signature: this.walletSignature,
        message: this.walletMessage
      };

      this.userApi.loginWithWallet(payload).pipe(
        tap((response) => {
          if (response.needsRegistration) {
            this.walletNeedsUsername = true;
            this.toast.info('Wallet connected! Choose a username.');
          } else if (response.user) {
            this.authStore.setUser(response.user);
            this.presenceStore.setOnline(response.user.id);
            this.toast.success('Welcome back!');
            this.router.navigate(['/chats']);
          }
        }),
        catchError((err) => {
          this.errorMessage = this.errorToast.toastError(err, 'Wallet login failed');
          return EMPTY;
        }),
        finalize(() => (this.walletPending = false))
      ).subscribe();

    } catch (error: any) {
      this.walletPending = false;
      if (error.code === 4001) {
        this.errorMessage = 'Connection cancelled by user.';
      } else {
        this.errorMessage = 'Failed to connect wallet: ' + (error.message || 'Unknown error');
      }
      this.toast.error(this.errorMessage);
    }
  }

  submitWalletRegister() {
    if (this.walletPending) {
      return;
    }
    if (this.walletUsernameForm.invalid) {
      this.errorMessage = 'Username is required (min 2 chars).';
      this.toast.error(this.errorMessage);
      return;
    }

    this.walletPending = true;
    this.errorMessage = '';

    const payload: WalletRegisterRequest = {
      walletAddress: this.walletAddress,
      signature: this.walletSignature,
      message: this.walletMessage,
      username: this.walletUsernameForm.getRawValue().username
    };

    this.userApi.registerWithWallet(payload).pipe(
      tap((user) => {
        this.authStore.setUser(user);
        this.presenceStore.setOnline(user.id);
        this.toast.success('Account created!');
        this.router.navigate(['/chats']);
      }),
      catchError((err) => {
        this.errorMessage = this.errorToast.toastError(err, 'Registration failed');
        return EMPTY;
      }),
      finalize(() => (this.walletPending = false))
    ).subscribe();
  }

  cancelWalletRegister() {
    this.walletNeedsUsername = false;
    this.walletAddress = '';
    this.walletSignature = '';
    this.walletMessage = '';
    this.walletUsernameForm.reset();
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
