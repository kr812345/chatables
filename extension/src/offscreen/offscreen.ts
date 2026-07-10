import { ChatMode, ChatMessage, ExtensionState, RuntimeMessage } from '../types';

let ws: WebSocket | null = null;
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let peerId: string | null = null;

// Initial Extension State
const state: ExtensionState = {
  status: 'idle',
  mode: null,
  name: null,
  peerName: null,
  messages: [],
  isPeerTyping: false,
  isMuted: false,
  error: null,
};

// Update and persist state using Background helper to bypass context limitations
async function updateState(newState: Partial<ExtensionState>) {
  Object.assign(state, newState);
  chrome.runtime.sendMessage({
    type: 'WRITE_STORAGE',
    payload: { appState: state }
  });
}

// Clean up WebRTC peer connection and microhpone streams
function cleanupWebRTC() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  const audioEl = document.getElementById('remote-audio') as HTMLAudioElement;
  if (audioEl) {
    audioEl.srcObject = null;
  }
}

// Clean up WebSocket signaling
function cleanupWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

// Fully disconnect and reset state
async function disconnectChat() {
  cleanupWebRTC();
  cleanupWebSocket();
  peerId = null;
  
  await updateState({
    status: 'idle',
    mode: null,
    name: null,
    peerName: null,
    messages: [],
    isPeerTyping: false,
    isMuted: false,
    error: null,
  });

  // Notify background to close this offscreen document
  chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' });
}

// Setup WebSocket connection and messaging loop
async function initWebSocket(mode: ChatMode, settings: any) {
  if (ws) {
    console.log('WebSocket connection already active. Ignoring init request.');
    return;
  }
  try {
    const userId = settings.userId;
    const url = settings.websocketUrl || 'ws://localhost:3000/chat';
    const wsUrl = `${url}?userId=${userId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = async () => {
      console.log('Signaling WebSocket connected');
      await updateState({ status: 'queuing', mode, error: null });

      // Join the matchmaking queue with our local settings
      const joinMsg = {
        type: 'join_queue',
        payload: {
          mode,
          interests: settings.interests || [],
          niche: settings.niche || '',
          genderPref: settings.genderPref || 'any',
          gender: settings.gender || 'other',
        },
      };
      ws?.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('Received socket message:', msg.type);

        switch (msg.type) {
          case 'pong':
            // Keep alive handled by fastify/ping
            break;

          case 'queue_status':
            if (msg.payload.status === 'waiting') {
              await updateState({ name: msg.payload.name });
            }
            break;

          case 'matched': {
            const { peerId: matchedPeerId, peerName, role } = msg.payload;
            peerId = matchedPeerId;

            await updateState({
              status: 'chatting',
              peerName,
              messages: [],
              isPeerTyping: false,
              error: null,
            });

            if (mode === 'voice') {
              // Initiate WebRTC call
              await handleWebRTCCall(role === 'offerer');
            }
            break;
          }

          case 'signal': {
            const { signalData } = msg.payload;
            if (pc) {
              if (signalData.sdp) {
                console.log('Setting remote description');
                await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                if (pc.remoteDescription?.type === 'offer') {
                  console.log('Remote is offerer, creating answer');
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  sendSocketMessage({
                    type: 'signal',
                    payload: {
                      targetUserId: peerId,
                      signalData: { sdp: pc.localDescription },
                    },
                  });
                }
              } else if (signalData.candidate) {
                console.log('Adding ICE candidate');
                await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
              }
            }
            break;
          }

          case 'msg': {
            const { text, timestamp } = msg.payload;
            const chatMsg: ChatMessage = {
              id: Math.random().toString(36).substring(2, 9),
              senderId: 'peer',
              text,
              timestamp,
            };
            await updateState({
              messages: [...state.messages, chatMsg],
              isPeerTyping: false,
            });
            break;
          }

          case 'peer_typing': {
            await updateState({ isPeerTyping: !!msg.payload.isTyping });
            break;
          }

          case 'peer_disconnected':
            cleanupWebRTC();
            await updateState({
              status: 'idle',
              peerName: null,
              error: 'Peer disconnected. The conversation was destroyed.'
            });
            // Auto close offscreen document after 5 seconds to return to idle completely
            setTimeout(() => {
              disconnectChat();
            }, 4000);
            break;

          case 'error':
            await updateState({ error: msg.payload.message });
            break;
        }
      } catch (err) {
        console.error('Error handling ws message payload:', err);
      }
    };

    ws.onclose = async () => {
      console.log('Signaling WebSocket closed');
      if (state.status === 'queuing') {
        await updateState({
          status: 'idle',
          error: `Connection closed. Could not connect to: ${ws?.url || 'server'}.`,
        });
        chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' });
      }
    };

    ws.onerror = async (err) => {
      console.error('Signaling WebSocket error:', err);
      await updateState({
        status: 'idle',
        error: `WebSocket connection failed. Could not connect to: ${ws?.url || 'server'}.`,
      });
      chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' });
    };

  } catch (err: any) {
    console.error('Failed to initialize WebSocket:', err);
    await updateState({ error: `Connection failed: ${err.message}` });
  }
}

// Send message over WebSocket
function sendSocketMessage(msg: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.error('WebSocket not connected. Cannot send message:', msg);
  }
}

// WebRTC logic (only run in voice mode)
async function handleWebRTCCall(isOfferer: boolean) {
  try {
    console.log(`Setting up RTCPeerConnection. Role: ${isOfferer ? 'Offerer' : 'Answerer'}`);
    
    // 1. Get microphone stream
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 2. Setup Peer Connection with public Google STUN servers
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    // 3. Bind ICE gathering
    pc.onicecandidate = (event) => {
      if (event.candidate && peerId) {
        sendSocketMessage({
          type: 'signal',
          payload: {
            targetUserId: peerId,
            signalData: { candidate: event.candidate },
          },
        });
      }
    };

    // 4. Bind remote audio stream track listening
    pc.ontrack = (event) => {
      console.log('Received remote audio track!');
      const audioEl = document.getElementById('remote-audio') as HTMLAudioElement;
      if (audioEl && event.streams[0]) {
        audioEl.srcObject = event.streams[0];
      }
    };

    // 5. Add local audio tracks to peer connection
    localStream.getTracks().forEach((track) => {
      pc?.addTrack(track, localStream!);
    });

    // 6. Handle offerer handshake
    if (isOfferer) {
      console.log('Role Offerer: Creating WebRTC SDP Offer');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      sendSocketMessage({
        type: 'signal',
        payload: {
          targetUserId: peerId,
          signalData: { sdp: pc.localDescription },
        },
      });
    }

  } catch (err: any) {
    console.error('Error establishing WebRTC PeerConnection:', err);
    await updateState({ error: `Voice connection failed. Make sure microphone permission is granted.` });
    
    // Send report/error to signaling and leave
    sendSocketMessage({
      type: 'leave_chat'
    });
    cleanupWebRTC();
  }
}

// Listen for settings triggers or messages from popup
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  console.log('Offscreen received runtime message:', message.type);

  switch (message.type) {
    case 'SEND_TEXT_MSG': {
      const { text } = message.payload;
      // Send text message via backend WebSocket signaling
      sendSocketMessage({
        type: 'send_msg',
        payload: { text },
      });

      // Update state local message logs
      const chatMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        senderId: 'me',
        text,
        timestamp: Date.now(),
      };
      updateState({
        messages: [...state.messages, chatMsg],
      });
      sendResponse({ success: true });
      break;
    }

    case 'SET_TYPING': {
      const { isTyping } = message.payload;
      sendSocketMessage({
        type: 'typing',
        payload: { isTyping },
      });
      sendResponse({ success: true });
      break;
    }

    case 'MUTE_MIC': {
      const { isMuted } = message.payload;
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = !isMuted;
        });
      }
      updateState({ isMuted });
      sendResponse({ success: true });
      break;
    }

    case 'REPORT_PEER': {
      const { reason } = message.payload;
      sendSocketMessage({
        type: 'report_user',
        payload: { reason },
      });
      // Cleanup locally
      disconnectChat();
      sendResponse({ success: true });
      break;
    }

    case 'CONNECT_WS': {
      const { mode, settings } = message.payload;
      console.log(`Connecting WebSocket for mode: ${mode}`);
      initWebSocket(mode, settings);
      sendResponse({ success: true });
      break;
    }

    case 'STOP_MATCHMAKING': {
      sendSocketMessage({
        type: 'leave_chat',
      });
      disconnectChat();
      sendResponse({ success: true });
      break;
    }
  }
  return true;
});

// Signal that the offscreen coordinator is fully loaded and ready
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });
