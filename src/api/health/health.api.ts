// frontend/src/api/health/health.api.ts
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable, of } from 'rxjs';

import { apiRootUrl } from '../base-urls';

export interface HealthResponse {
  status: string;
  components?: Record<string, { status: string }>;
}

@Injectable({ providedIn: 'root' })
export class HealthApi {
  constructor(private http: HttpClient) {}

  user(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('user', '/actuator/health'));
  }

  server(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('server', '/actuator/health'));
  }

  membership(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('membership', '/actuator/health'));
  }

  message(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('message', '/actuator/health'));
  }

  presence(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('presence', '/actuator/health'));
  }

  notification(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('notification', '/actuator/health'));
  }

  encryption(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('encryption', '/actuator/health'));
  }

  media(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('media', '/actuator/health'));
  }

  search(): Observable<HealthResponse> {
    return EMPTY;
    return this.http.get<HealthResponse>(apiRootUrl('search', '/actuator/health'));
  }
}
