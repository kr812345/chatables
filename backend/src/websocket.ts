import { FastifyInstance, FastifyRequest } from 'fastify';
import Redis from 'ioredis';
import { CONFIG } from './config';
import {
  setUserSession,
  getUserSession,
  deleteUserSession,
  addToQueue,
  removeFromQueue,
  scanAndMatch,
  destroyChatSession,
  redis,
} from './redis';
import { ClientMessage, ServerMessage, UserSession, ChatMode } from './types';

// PubSub Subscriber client (since subscription locks the connection)
const subClient = new Redis(CONFIG.REDIS_URL);
subClient.on('connect', () => console.log('Redis SubClient Connected'));
subClient.on('error', (err) => console.error('Redis SubClient Error:', err));

// Active local connections map
const localSockets = new Map<string, any>();

// Listen for Redis pub/sub messages and forward them to the local WebSockets
subClient.on('message', (channel, message) => {
  const userId = channel.replace('user:channel:', '');
  const ws = localSockets.get(userId);
  if (ws) {
    try {
      ws.send(message);
    } catch (e) {
      console.error(`Failed to forward message to user ${userId}:`, e);
    }
  }
});

// Broadcast/publish helper to send messages to any user (local or remote)
async function sendToUser(userId: string, msg: ServerMessage): Promise<void> {
  const channel = `user:channel:${userId}`;
  await redis.publish(channel, JSON.stringify(msg));
}

// Anonymous names list
const ADJECTIVES = ['Quiet', 'Sleek', 'Wandering', 'Clever', 'Gentle', 'Silent', 'Swift', 'Bold', 'Calm', 'Bright', 'Mystery', 'Noble'];
const ANIMALS = ['Fox', 'Panda', 'Penguin', 'Koala', 'Otter', 'Badger', 'Tiger', 'Owl', 'Dolphin', 'Rabbit', 'Falcon', 'Wolf'];

function generateAnonymousName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const anim = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const randNum = Math.floor(Math.random() * 9000) + 1000;
  return `${adj} ${anim} #${randNum}`;
}

export async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get('/chat', { websocket: true }, (ws: any, req: FastifyRequest) => {
    
    // Extract userId from query parameters
    const query = req.query as { userId?: string; gender?: string };
    const userId = query.userId || `usr_${Math.random().toString(36).substring(2, 15)}`;
    
    console.log(`WebSocket connection opened for User: ${userId}`);

    // Map connection and subscribe
    localSockets.set(userId, ws);
    subClient.subscribe(`user:channel:${userId}`).catch((err) => {
      console.error(`SubClient failed to subscribe to channel for user ${userId}:`, err);
    });

    let isAlive = true;
    
    // Set up heartbeat ping interval
    const pingInterval = setInterval(() => {
      if (!isAlive) {
        console.log(`User ${userId} heartbeat timeout. Terminating.`);
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();
    }, CONFIG.PING_INTERVAL_MS);

    ws.on('pong', () => {
      isAlive = true;
    });

    // Message handler
    ws.on('message', async (rawData: any) => {
      try {
        const message = JSON.parse(rawData.toString()) as ClientMessage;
        
        switch (message.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          case 'join_queue': {
            const { mode, interests, niche, genderPref, gender } = message.payload || {};
            
            if (!mode || (mode !== 'voice' && mode !== 'text')) {
              ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid chat mode' } }));
              return;
            }

            const cleanInterests = Array.isArray(interests) 
              ? interests.map(i => i.trim()).filter(Boolean) 
              : [];

            // Generate an anonymous identity for this session
            const name = generateAnonymousName();

            const session: UserSession = {
              userId,
              socketId: userId, // simplicity: scale handles by routing through Redis PubSub
              name,
              mode: mode as ChatMode,
              status: 'idle',
              preferences: {
                interests: cleanInterests,
                niche,
                genderPref,
                gender,
              },
              lastActive: Date.now(),
            };

            await setUserSession(session);
            await addToQueue(session);

            console.log(`User ${userId} (${name}) joined queue for mode ${mode}. Interests: ${JSON.stringify(cleanInterests)}`);

            // Try to match immediately
            const match = await scanAndMatch(userId);
            if (match) {
              const sessionA = await getUserSession(match.userA);
              const sessionB = await getUserSession(match.userB);

              if (sessionA && sessionB) {
                // Notify user A (offerer)
                await sendToUser(match.userA, {
                  type: 'matched',
                  payload: {
                    peerId: match.userB,
                    peerName: sessionB.name,
                    role: 'offerer',
                    mode: match.mode,
                    sessionId: match.sessionId,
                  },
                });

                // Notify user B (answerer)
                await sendToUser(match.userB, {
                  type: 'matched',
                  payload: {
                    peerId: match.userA,
                    peerName: sessionA.name,
                    role: 'answerer',
                    mode: match.mode,
                    sessionId: match.sessionId,
                  },
                });
              }
            } else {
              // Send queue confirmation
              ws.send(JSON.stringify({
                type: 'queue_status',
                payload: { status: 'waiting', name }
              }));
            }
            break;
          }

          case 'leave_queue':
            await removeFromQueue(userId);
            ws.send(JSON.stringify({ type: 'queue_status', payload: { status: 'idle' } }));
            break;

          case 'signal': {
            const { targetUserId, signalData } = message.payload || {};
            if (!targetUserId || !signalData) return;
            
            // Forward signal payload to the target peer
            await sendToUser(targetUserId, {
              type: 'signal',
              payload: {
                senderUserId: userId,
                signalData,
              },
            });
            break;
          }

          case 'send_msg': {
            const { text } = message.payload || {};
            if (!text) return;

            const session = await getUserSession(userId);
            if (session && session.status === 'chatting' && session.matchedWith) {
              await sendToUser(session.matchedWith, {
                type: 'msg',
                payload: {
                  text,
                  senderId: userId,
                  timestamp: Date.now(),
                },
              });
            }
            break;
          }

          case 'typing': {
            const { isTyping } = message.payload || {};
            const session = await getUserSession(userId);
            if (session && session.status === 'chatting' && session.matchedWith) {
              await sendToUser(session.matchedWith, {
                type: 'peer_typing',
                payload: { isTyping: !!isTyping },
              });
            }
            break;
          }

          case 'leave_chat': {
            const session = await getUserSession(userId);
            if (session && session.sessionId) {
              const destroyed = await destroyChatSession(session.sessionId);
              if (destroyed) {
                await sendToUser(destroyed.userA, { type: 'peer_disconnected' });
                await sendToUser(destroyed.userB, { type: 'peer_disconnected' });
              }
            }
            break;
          }

          case 'report_user': {
            const { reason } = message.payload || {};
            console.log(`User ${userId} reported partner for: ${reason}`);
            // Instantly trigger disconnect as safety measure
            const session = await getUserSession(userId);
            if (session && session.sessionId) {
              const destroyed = await destroyChatSession(session.sessionId);
              if (destroyed) {
                await sendToUser(destroyed.userA, { type: 'peer_disconnected' });
                await sendToUser(destroyed.userB, { type: 'peer_disconnected' });
              }
            }
            // Put offender on temporary cooldown in Redis (15 mins)
            if (session && session.matchedWith) {
              const offenderIpHash = `cooldown:${session.matchedWith}`;
              await redis.set(offenderIpHash, '1', 'EX', CONFIG.COOLDOWN_TTL);
            }
            break;
          }

          default:
            console.warn(`Unknown message type: ${message.type}`);
        }
      } catch (err) {
        console.error('Error handling websocket message:', err);
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Internal server error' } }));
      }
    });

    // Connection closed
    ws.on('close', async () => {
      console.log(`WebSocket connection closed for User: ${userId}`);
      clearInterval(pingInterval);
      
      // Clean up connections map and unsubscribe
      localSockets.delete(userId);
      subClient.unsubscribe(`user:channel:${userId}`).catch(() => {});

      try {
        const session = await getUserSession(userId);
        if (session) {
          if (session.status === 'queuing') {
            await removeFromQueue(userId);
          } else if (session.status === 'chatting' && session.sessionId) {
            const destroyed = await destroyChatSession(session.sessionId);
            if (destroyed) {
              await sendToUser(destroyed.userA, { type: 'peer_disconnected' });
              await sendToUser(destroyed.userB, { type: 'peer_disconnected' });
            }
          }
          await deleteUserSession(userId);
        }
      } catch (err) {
        console.error('Error cleaning up disconnected user:', err);
      }
    });

    ws.on('error', (err: any) => {
      console.error(`WebSocket error for User ${userId}:`, err);
    });
  });
}
