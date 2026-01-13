import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../base-urls';
import {
  IndexMessageRequest,
  IndexUserRequest,
  MessageSearchRequest,
  MessageSearchResult,
  SearchPage,
  UserSearchResult
} from './search.dto';

@Injectable({ providedIn: 'root' })
export class SearchApi {
  constructor(private http: HttpClient) { }

  searchMessages(request: MessageSearchRequest): Observable<SearchPage<MessageSearchResult>> {
    let params = new HttpParams()
      .set('userId', request.userId)
      .set('query', request.query);
    if (request.channelId) {
      params = params.set('channelId', request.channelId);
    }
    if (request.senderId) {
      params = params.set('senderId', request.senderId);
    }
    if (request.dateFrom) {
      params = params.set('dateFrom', request.dateFrom);
    }
    if (request.dateTo) {
      params = params.set('dateTo', request.dateTo);
    }
    if (request.page !== undefined) {
      params = params.set('page', request.page);
    }
    if (request.size !== undefined) {
      params = params.set('size', request.size);
    }

    return this.http.get<SearchPage<MessageSearchResult>>(apiUrl('search', '/messages'), { params });
  }

  getMessagesByChannel(channelId: string): Observable<MessageSearchResult[]> {
    return this.http.get<MessageSearchResult[]>(apiUrl('search', `/messages/channel/${channelId}`));
  }

  getMessagesBySender(senderId: string): Observable<MessageSearchResult[]> {
    return this.http.get<MessageSearchResult[]>(apiUrl('search', `/messages/sender/${senderId}`));
  }

  searchUsers(query: string): Observable<UserSearchResult[]> {
    const params = new HttpParams().set('query', query);
    return this.http.get<UserSearchResult[]>(apiUrl('search', '/users'), { params });
  }

  indexMessage(payload: IndexMessageRequest): Observable<MessageSearchResult> {
    return this.http.post<MessageSearchResult>(apiUrl('search', '/index/message'), payload);
  }

  indexUser(payload: IndexUserRequest): Observable<UserSearchResult> {
    return this.http.post<UserSearchResult>(apiUrl('search', '/index/user'), payload);
  }

  deleteMessage(id: string): Observable<void> {
    return this.http.delete<void>(apiUrl('search', `/index/message/${id}`));
  }

  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(apiUrl('search', `/index/user/${id}`));
  }
}
