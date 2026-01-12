import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';

import { AuthPageComponent } from './auth-page.component';
import { UserApi } from '../../../api/users/user.api';
import { AuthStore } from '../../core/state/auth.store';
import { ToastService } from '../../core/ui/toast/toast.service';
import { ErrorToastService } from '../../core/ui/toast/error-toast.service';
import { PresenceStore } from '../../core/state/presence.store';
import { UserDto } from '../../../api/users/user.dto';

describe('AuthPageComponent', () => {
  let fixture: ComponentFixture<AuthPageComponent>;
  let component: AuthPageComponent;
  let userApi: jasmine.SpyObj<UserApi>;
  let authStore: jasmine.SpyObj<AuthStore>;
  let toast: jasmine.SpyObj<ToastService>;
  let errorToast: jasmine.SpyObj<ErrorToastService>;
  let presenceStore: jasmine.SpyObj<PresenceStore>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userApi = jasmine.createSpyObj('UserApi', ['login', 'register']);
    authStore = jasmine.createSpyObj('AuthStore', ['setUser', 'clear'], {
      user$: of(null),
      snapshot: null
    });
    toast = jasmine.createSpyObj('ToastService', ['error', 'info', 'success']);
    errorToast = jasmine.createSpyObj('ErrorToastService', ['toastError']);
    presenceStore = jasmine.createSpyObj('PresenceStore', ['setOnline', 'setOffline']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [AuthPageComponent],
      providers: [
        { provide: UserApi, useValue: userApi },
        { provide: AuthStore, useValue: authStore },
        { provide: ToastService, useValue: toast },
        { provide: ErrorToastService, useValue: errorToast },
        { provide: PresenceStore, useValue: presenceStore },
        { provide: Router, useValue: router }
      ]
    });

    fixture = TestBed.createComponent(AuthPageComponent);
    component = fixture.componentInstance;
  });

  it('shows validation error when login form invalid', () => {
    component.submitLogin();

    expect(component.errorMessage).toContain('required');
    expect(toast.error).toHaveBeenCalled();
    expect(userApi.login).not.toHaveBeenCalled();
  });

  it('logs in and runs health checks on success', () => {
    const user: UserDto = { id: 'user-1', username: 'sam' };
    userApi.login.and.returnValue(of(user));
    router.navigate.and.returnValue(Promise.resolve(true));

    component.loginForm.setValue({ username: 'sam', password: 'pw' });
    component.submitLogin();

    expect(authStore.setUser).toHaveBeenCalledWith(user);
    expect(presenceStore.setOnline).toHaveBeenCalledWith(user.id);
    expect(router.navigate).toHaveBeenCalledWith(['/chats']);
  });

  it('surfaces login errors through ErrorToastService', () => {
    const err = new Error('bad');
    errorToast.toastError.and.returnValue('Login failed');
    userApi.login.and.returnValue(throwError(() => err));

    component.loginForm.setValue({ username: 'sam', password: 'pw' });
    component.submitLogin();

    expect(errorToast.toastError).toHaveBeenCalledWith(err, 'Login failed');
    expect(component.errorMessage).toBe('Login failed');
    expect(component.loginPending).toBeFalse();
  });
});
