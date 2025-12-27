export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED'
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  status: MessageStatus;
  readBy: string[];
  dateSent: string;
  media?: MediaAttachment[];
}

export interface MessageDto {
  id?: string;
  channelId: string;
  senderId: string;
  content: string;
  status?: MessageStatus;
  readBy?: string[];
  dateSent?: string;
  media?: MediaAttachment[];
}

export interface MediaAttachment {
  id: string;
  uploaderId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt?: string;
  downloadUrl?: string;
}
