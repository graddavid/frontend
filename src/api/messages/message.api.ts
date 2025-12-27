import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../base-urls';
import { Page } from '../shared/page.model';
import { Message, MessageDto } from './message.dto';

@Injectable({ providedIn: 'root' })
export class MessageApi {
  constructor(private http: HttpClient) {}

  getMessagesForChannel(channelId: string, pageNo: number, pageSize: number): Observable<Page<Message>> {
    const params = new HttpParams()
      .set('channelId', channelId)
      .set('pageNo', pageNo)
      .set('pageSize', pageSize);
    return this.http.get<Page<Message>>(apiUrl('message'), { params });
  }

  getInboxForUserId(userId: string): Observable<Message[]> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<Message[]>(apiUrl('message', '/inbox'), { params });
  }

  getMessageById(id: string): Observable<Message> {
    return this.http.get<Message>(apiUrl('message', `/${id}`));
  }

  sendMessage(payload: MessageDto, files?: File[]): Observable<Message> {
    if (files && files.length) {
      const form = new FormData();
      form.append(
        'payload',
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
      files.forEach((file) => form.append('files', file, file.name));
      return this.http.post<Message>(apiUrl('message'), form);
    }
    return this.http.post<Message>(apiUrl('message'), payload);
  }

  deleteMessage(id: string): Observable<string> {
    return this.http.delete<string>(apiUrl('message', `/${id}`), {
      responseType: 'text' as 'json'
    });
  }

  editMessage(payload: MessageDto): Observable<Message> {
    return this.http.put<Message>(apiUrl('message'), payload);
  }
}
