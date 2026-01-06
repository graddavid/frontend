export const environment = {
  production: true,
  useMocks: false,
  apiBaseUrls: {
    user: 'http://localhost:8032',
    server: 'http://localhost:8031',
    membership: 'http://localhost:8031',
    message: 'http://localhost:8080',
    presence: 'http://localhost:8081',
    notification: 'http://localhost:8085',
    internalNotification: 'http://localhost:8085',
    encryption: 'http://localhost:8082',
    password: 'http://localhost:8082',
    media: 'http://localhost:8083',
    search: 'http://localhost:8084'
  },
  notificationWs: 'http://localhost:8085/ws'
};
