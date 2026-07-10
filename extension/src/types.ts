export type ChatMode = 'voice' | 'text';

export interface UserSettings {
  userId: string;
  interests: string[];
  niche: string;
  gender: 'male' | 'female' | 'other';
  genderPref: 'male' | 'female' | 'any';
  websocketUrl: string;
}

export interface ChatMessage {
  id: string;
  senderId: 'me' | 'peer';
  text: string;
  timestamp: number;
}

export type ExtensionStatus = 'idle' | 'queuing' | 'chatting';

export interface ExtensionState {
  status: ExtensionStatus;
  mode: ChatMode | null;
  name: string | null;       // My temporary anonymous name
  peerName: string | null;   // Matched peer's anonymous name
  messages: ChatMessage[];
  isPeerTyping: boolean;
  isMuted: boolean;
  error: string | null;
}

// Inter-context Message Interfaces
export interface RuntimeMessage {
  type: 
    | 'START_MATCHMAKING'
    | 'STOP_MATCHMAKING'
    | 'GET_STATUS'
    | 'SEND_TEXT_MSG'
    | 'SET_TYPING'
    | 'MUTE_MIC'
    | 'REPORT_PEER'
    | 'STATUS_UPDATE'
    | 'OFFSCREEN_READY'
    | 'CONNECT_WS'
    | 'WRITE_STORAGE';
  payload?: any;
}
