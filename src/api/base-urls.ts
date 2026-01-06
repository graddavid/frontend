import { environment } from '../environments/environment';

export type ApiServiceKey =
  | 'user'
  | 'server'
  | 'membership'
  | 'message'
  | 'presence'
  | 'notification'
  | 'internalNotification'
  | 'encryption'
  | 'password'
  | 'media'
  | 'search';

const defaultBaseRoots: Record<ApiServiceKey, string> = {
  user: '',
  server: '',
  membership: '',
  message: '',
  presence: '',
  notification: '',
  internalNotification: '',
  encryption: '',
  password: '',
  media: '',
  search: ''
};

const servicePaths: Record<ApiServiceKey, string> = {
  user: '/api/users',
  server: '/api/servers',
  membership: '/api/memberships',
  message: '/message',
  presence: '/presence',
  notification: '/notifications',
  internalNotification: '/internal/notifications',
  encryption: '/encryption',
  password: '/password',
  media: '/media',
  search: '/search'
};

const envBaseUrls =
  (environment as { apiBaseUrls?: Partial<Record<ApiServiceKey, string>> }).apiBaseUrls || {};

export const apiBaseUrls: Record<ApiServiceKey, string> = {
  ...defaultBaseRoots,
  ...envBaseUrls
};

export const apiUrl = (key: ApiServiceKey, path = '') =>
  `${apiBaseUrls[key]}${servicePaths[key]}${path}`;

export const apiRootUrl = (key: ApiServiceKey, path = '') => `${apiBaseUrls[key]}${path}`;
