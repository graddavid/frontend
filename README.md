# PRPO Chat Frontend (Angular 17)

Angular 17 SPA for the PRPO chat microservices project. The UI already calls real services for auth, servers, messages, presence, notifications, media, and search using the typed clients under `src/api`.

## Getting started

- `npm install`
- `npm start` -> http://localhost:4200
- `npm run build` for a production bundle

## Configuration

- API base URLs and the notification WebSocket endpoint live in `src/environments/*.ts` (`apiBaseUrls` + `notificationWs`). Defaults point to local microservice ports:
  - user `http://localhost:8032/api/users`
  - server/membership `http://localhost:8031/api/servers` / `/memberships`
  - message `http://localhost:8080/message`
  - presence `http://localhost:8081/presence`
  - notification `http://localhost:8085/notifications` and WS `http://localhost:8085/ws`
  - encryption/password `http://localhost:8082`
  - media `http://localhost:8083/media`
  - search `http://localhost:8084/search`
- Dev `environment.ts` has `useMocks: true`, but the implementation calls the real APIs; point these URLs at your running backend before using the UI.

## Routing

- `/auth` login/register screen (unguarded).
- `/chats` and `/chats/:serverId` chat hub (guarded by `authGuard`, redirecting to `/auth` when no user is stored).

## Feature overview

- **Auth** (`src/app/features/auth`): Reactive login/register forms with validation; calls `UserApi.login`/`register`, stores the user in `AuthStore` (localStorage backed), marks presence online, navigates to chats, and surfaces errors via toasts. Logout clears auth and marks presence offline.
- **Shell** (`src/app/core/layout/shell`): Top bar with branding and logout link; hosts the routed content; integrates the toast container globally.
- **Chats hub** (`src/app/features/chats`):
  - Loads the signed-in user's servers via `MembershipApi.getServers`, splits DMs vs groups, and hydrates DM names by fetching members/usernames.
  - Create popover supports DM (search users via `SearchApi.searchUsers`) or group creation (`ServerApi.createServer`), optional bio, and auto-navigation to the new chat.
  - Group member management popover: search users, add (`MembershipApi.addMember`), remove, or ban members; presence dots appear for users when known.
  - Message pane per server: paginated fetch (20 per page) via `MessageApi.getMessagesForChannel` with infinite scroll and per-channel caching; user labels fetched lazily from `UserApi`.
  - Sending messages uses `MessageApi.sendMessage` and supports file attachments (multipart upload) plus download links through `MediaApi.download`.
  - Message search dialog uses `SearchApi.searchMessages` with filters (query, channel, sender, date range) and annotates results with cached user/server labels.
- **Realtime + signals**:
  - `NotificationStore` opens a STOMP/SockJS client to the notification service, subscribes to the user queue/topic, fetches unread on connect, dedupes, auto-marks as read, shows toast previews, and navigates to the target chat when clicked. Message notifications push into the chat page to fetch the new message immediately.
  - `PresenceStore` polls `PresenceApi.getBulkPresence` every 10s for tracked users, exposes a `presenceStatus` pipe, and sets online/offline on app init/unload via `AppComponent`.
  - `errorToastInterceptor` surfaces HTTP failures through the shared toast system (`core/ui/toast`).

## Key files

- Routing/config: `src/app/app.routes.ts`, `src/app/app.config.ts`
- State: `src/app/core/state/*` (auth, presence, notifications)
- UI shell + toasts: `src/app/core/layout/shell`, `src/app/core/ui/toast`
- Feature pages: `src/app/features/auth`, `src/app/features/chats`
- API clients/DTOs: `src/api/**/*`
