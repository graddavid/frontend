export interface MessageSearchRequest {
  userId: string;
  query: string;
  channelId?: string;
  senderId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  size?: number;
}

export interface MessageSearchResult {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  dateSent: string;
  highlightedContent?: string | null;
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName?: string;
}

export interface IndexMessageRequest {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  dateSent: string;
}

export interface IndexUserRequest {
  id: string;
  username: string;
  displayName?: string;
}

export interface SearchPage<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
