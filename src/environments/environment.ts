export const environment = {
  production: false,

  /**
   * App runs without backend by default.
   * Set to false and fill assets/config.json to wire real services.
   */
  useMocks: true,
  apiBaseUrls: {
    user: 'http://localhost:8032/api/users',
    server: 'http://localhost:8031/api/servers',
    membership: 'http://localhost:8031/api/memberships',
    message: 'http://localhost:8080/message',
    presence: 'http://localhost:8081/presence',
    notification: 'http://localhost:8085/notifications',
    internalNotification: 'http://localhost:8085/internal/notifications',
    encryption: 'http://localhost:8082/encryption',
    password: 'http://localhost:8082/password',
    media: 'http://localhost:8083/media',
    search: 'http://localhost:8084/search'
  },
  notificationWs: 'http://localhost:8085/ws'
};
