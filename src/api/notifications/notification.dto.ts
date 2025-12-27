export enum NotificationType {
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED'
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ'
}

export interface NotificationResponse {
  id: string;
  recipientId: string;
  senderId: string;
  channelId: string;
  type: NotificationType;
  status: NotificationStatus;
  text: string;
  messageId: string;
  createdAt: string;
  readAt?: string | null;
}

export interface MessageReceivedNotificationRequest {
  messageId: string;
  senderId: string;
  channelId: string;
  text: string;
}
