# Chatables: Privacy-First Anonymous Chat Chrome Extension

A privacy-first Chrome Extension that connects users with compatible strangers through **voice or text** in under 5 seconds. Designed forManifest V3, utilizing WebRTC for peer-to-peer audio, WebSockets for signaling, and an ephemeral Redis data store.

> **Click → Match → Talk → Leave → Everything disappears.**

---

## Key Features

- **Voice-First / Text Support**: Seamless peer-to-peer WebRTC voice streaming with a text-chat fallback drawer.
- **Zero Persistence**: No emails, phone numbers, profiles, logins, message archives, or logs. Redis stores sessions with a strict TTL and disk-writes disabled.
- **Manifest V3 Compliant**: Uses a **Chrome Offscreen Document** to manage WebSockets and WebRTC connections, bypassing MV3 background service worker sleep limits and enabling background calling when the popup UI is closed.
- **Interest Matching**: Match dynamically based on interests, niche, and optional gender preferences stored only in local storage.
- **Premium Aesthetics**: Dark theme by default, featuring custom glassmorphism panels and glowing matchmaking animations.

---

## Directory Overview

- [backend/](file:///home/krishna/Documents/Code/experiments/chatables/backend): Node.js / Fastify signaling server.
- [extension/](file:///home/krishna/Documents/Code/experiments/chatables/extension): React / TypeScript / Tailwind CSS Chrome extension source.
- [docker/](file:///home/krishna/Documents/Code/experiments/chatables/docker): Docker Compose environment (Redis, Fastify, Coturn TURN).

---

## Getting Started

### 1. Run the Backend Infrastructure

Ensure Docker and Docker Compose are installed, then spin up the backend server, Redis instance, and Coturn server:

```bash
cd docker
docker-compose up --build
```

If you prefer to run the backend locally without Docker:
1. Start a local Redis server on `port 6379`.
2. Install and start the backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

### 2. Build the Chrome Extension

Compile and bundle the extension's popup, settings page, and background script:

```bash
cd extension
npm install
npm run build
```

The output bundle will be generated in `extension/dist/`.

### 3. Load the Extension in Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle at the top-right).
4. Click **Load unpacked** (top-left).
5. Select the `extension/dist/` directory.
6. Pin **Chatables** to your extension bar.

---

## How it Works (MV3 Architecture)

```
[Popup React UI]  <-- chrome.storage.local -->  [Offscreen Document]
       │                                                 │
(chrome.runtime)                                   (WebSockets)
       │                                                 │
[Background Worker] ── Spawns Offscreen ─────────> [Fastify Backend]
                                                         │
                                                      (Redis)
```

1. **State Synchronization**: The Popup and Offscreen Document sync via `chrome.storage.local` under the `appState` namespace. This keeps the Popup UI stateless and allows it to close/reopen without interrupting active calls.
2. **WebSocket & WebRTC Lifecycle**: The background worker (`background.ts`) spawns `offscreen.html` (containing `offscreen.ts`) when matchmaking starts.
3. **Audio Capture**: The offscreen page requests microphone permission (only during voice calls) and uses `RTCPeerConnection` to stream audio via STUN/TURN, piping the remote audio stream directly into an `<audio>` tag.
4. **Horizontal Scaling**: Fastify signaling instances coordinate matching queues and forward client signals across server nodes using Redis Pub/Sub channels (`user:channel:<userId>`).
