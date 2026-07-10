export type ChatMode = 'voice' | 'text';

export interface UserPreferences {
  interests: string[];
  niche?: string;
  genderPref?: 'male' | 'female' | 'any';
  gender?: 'male' | 'female' | 'other';
}

// Client -> Server messages
export type ClientMessageType =
  | 'join_queue'
  | 'leave_queue'
  | 'signal'
  | 'send_msg'
  | 'typing'
  | 'leave_chat'
  | 'report_user'
  | 'ping';

export interface ClientMessage {
  type: ClientMessageType;
  payload?: any;
}

// Server -> Client messages
export type ServerMessageType =
  | 'queue_status'
  | 'matched'
  | 'signal'
  | 'msg'
  | 'peer_typing'
  | 'peer_disconnected'
  | 'error'
  | 'pong';

export interface ServerMessage {
  type: ServerMessageType;
  payload?: any;
}

// Redis/Memory Session Representation
export interface UserSession {
  userId: string;
  socketId: string;
  name: string;
  mode: ChatMode;
  status: 'idle' | 'queuing' | 'chatting';
  matchedWith?: string;
  sessionId?: string;
  preferences: UserPreferences;
  joinedQueueAt?: number;
  lastActive: number;
}

export interface ChatSession {
  sessionId: string;
  userA: string; // userId A
  userB: string; // userId B
  mode: ChatMode;
  createdAt: number;
}
