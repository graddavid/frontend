import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../base-urls';
import {
  FriendshipRequest,
  LoginRequest,
  RegisterRequest,
  UserDto,
  UserSettings
} from './user.dto';

@Injectable({ providedIn: 'root' })
export class UserApi {
  constructor(private http: HttpClient) {}

  register(payload: RegisterRequest): Observable<UserDto> {
    return this.http.post<UserDto>(apiUrl('user', '/register'), payload);
  }

  login(payload: LoginRequest): Observable<UserDto> {
    return this.http.post<UserDto>(apiUrl('user', '/login'), payload);
  }

  getById(userId: string): Observable<UserDto> {
    return this.http.get<UserDto>(apiUrl('user', `/${userId}`));
  }

  getSettings(userId: string): Observable<UserSettings> {
    return this.http.get<UserSettings>(apiUrl('user', `/settings/${userId}`));
  }

  getFriends(userId: string): Observable<string[]> {
    return this.http.get<string[]>(apiUrl('user', `/friends/${userId}`));
  }

  setFriends(payload: FriendshipRequest): Observable<void> {
    return this.http.post<void>(apiUrl('user', '/friends'), payload);
  }

  hello(): Observable<string> {
    return this.http.get<string>(apiUrl('user', '/hello'), { responseType: 'text' as 'json' });
  }
}
