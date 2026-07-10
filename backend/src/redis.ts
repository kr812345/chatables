import Redis from 'ioredis';
import { CONFIG } from './config';
import { UserSession, ChatSession, ChatMode } from './types';

// Initialize ioredis client
export const redis = new Redis(CONFIG.REDIS_URL);

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Helper keys
const socketKey = (socketId: string) => `socket:${socketId}`;
const userKey = (userId: string) => `user:${userId}`;
const chatKey = (sessionId: string) => `chat:${sessionId}`;
const userQueuesKey = (userId: string) => `user_queues:${userId}`;
const queueKey = (mode: string, topic: string) => `queue:${mode}:${topic}`;

// LUA script for atomic matchmaking transition
// Keys:
// 1. userKey(userIdA)
// 2. userKey(userIdB)
// 3. userQueuesKey(userIdA)
// 4. userQueuesKey(userIdB)
// 5. chatKey(sessionId)
// Arguments:
// 1. userIdA
// 2. userIdB
// 3. sessionId
// 4. chatSessionJson
// 5. sessionTtl
const matchTransitionLua = `
  local userA = redis.call('get', KEYS[1])
  local userB = redis.call('get', KEYS[2])
  
  if not userA or not userB then
    return 0
  end
  
  local sessionA = cjson.decode(userA)
  local sessionB = cjson.decode(userB)
  
  if sessionA.status ~= 'queuing' or sessionB.status ~= 'queuing' then
    return 0
  end
  
  -- Update status and pointers
  sessionA.status = 'chatting'
  sessionA.matchedWith = ARGV[2]
  sessionA.sessionId = ARGV[3]
  
  sessionB.status = 'chatting'
  sessionB.matchedWith = ARGV[1]
  sessionB.sessionId = ARGV[3]
  
  redis.call('set', KEYS[1], cjson.encode(sessionA), 'EX', ARGV[5])
  redis.call('set', KEYS[2], cjson.encode(sessionB), 'EX', ARGV[5])
  
  -- Remove from all queues they were in
  local queuesA = redis.call('smembers', KEYS[3])
  for _, q in ipairs(queuesA) do
    redis.call('zrem', q, ARGV[1])
  end
  redis.call('del', KEYS[3])
  
  local queuesB = redis.call('smembers', KEYS[4])
  for _, q in ipairs(queuesB) do
    redis.call('zrem', q, ARGV[2])
  end
  redis.call('del', KEYS[4])
  
  -- Create chat session
  redis.call('set', KEYS[5], ARGV[4], 'EX', ARGV[5])
  
  return 1
`;

// Register LUA script
redis.defineCommand('tryMatchTransition', {
  numberOfKeys: 5,
  lua: matchTransitionLua,
});

declare module 'ioredis' {
  interface Redis {
    tryMatchTransition(
      key1: string,
      key2: string,
      key3: string,
      key4: string,
      key5: string,
      arg1: string,
      arg2: string,
      arg3: string,
      arg4: string,
      arg5: string
    ): Promise<number>;
  }
}

// Session helpers
export async function setUserSession(session: UserSession): Promise<void> {
  const key = userKey(session.userId);
  await redis.set(key, JSON.stringify(session), 'EX', CONFIG.SESSION_TTL);
}

export async function getUserSession(userId: string): Promise<UserSession | null> {
  const data = await redis.get(userKey(userId));
  if (!data) return null;
  return JSON.parse(data) as UserSession;
}

export async function deleteUserSession(userId: string): Promise<void> {
  await redis.del(userKey(userId));
}

// Socket mapping helpers
export async function mapSocketToUser(socketId: string, userId: string): Promise<void> {
  await redis.set(socketKey(socketId), userId, 'EX', CONFIG.SESSION_TTL);
}

export async function getUserIdBySocket(socketId: string): Promise<string | null> {
  return await redis.get(socketKey(socketId));
}

export async function deleteSocketMapping(socketId: string): Promise<void> {
  await redis.del(socketKey(socketId));
}

// Queue operations
export async function addToQueue(session: UserSession): Promise<void> {
  const userId = session.userId;
  const mode = session.mode;
  const topics = session.preferences.interests.length > 0
    ? session.preferences.interests
    : ['general'];

  // Keep track of the queues this user is in
  const uqKey = userQueuesKey(userId);
  
  const pipeline = redis.pipeline();
  
  // Set user session to queuing status
  session.status = 'queuing';
  session.joinedQueueAt = Date.now();
  pipeline.set(userKey(userId), JSON.stringify(session), 'EX', CONFIG.SESSION_TTL);
  
  // Add to each interest queue
  for (const topic of topics) {
    const qKey = queueKey(mode, topic.toLowerCase().trim());
    pipeline.zadd(qKey, Date.now(), userId);
    pipeline.expire(qKey, CONFIG.QUEUE_TTL);
    pipeline.sadd(uqKey, qKey);
  }
  pipeline.expire(uqKey, CONFIG.QUEUE_TTL);
  
  await pipeline.exec();
}

export async function removeFromQueue(userId: string): Promise<void> {
  const uqKey = userQueuesKey(userId);
  const queues = await redis.smembers(uqKey);
  
  const pipeline = redis.pipeline();
  for (const q of queues) {
    pipeline.zrem(q, userId);
  }
  pipeline.del(uqKey);
  
  // Restore status to idle
  const session = await getUserSession(userId);
  if (session && session.status === 'queuing') {
    session.status = 'idle';
    session.joinedQueueAt = undefined;
    pipeline.set(userKey(userId), JSON.stringify(session), 'EX', CONFIG.SESSION_TTL);
  }
  
  await pipeline.exec();
}

// Check compatibility of two sessions
function areCompatible(userA: UserSession, userB: UserSession): boolean {
  if (userA.userId === userB.userId) return false;
  if (userA.status !== 'queuing' || userB.status !== 'queuing') return false;
  if (userA.mode !== userB.mode) return false;

  // Gender Pref checks
  // User A pref check
  if (userA.preferences.genderPref && userA.preferences.genderPref !== 'any') {
    if (userB.preferences.gender !== userA.preferences.genderPref) return false;
  }
  // User B pref check
  if (userB.preferences.genderPref && userB.preferences.genderPref !== 'any') {
    if (userA.preferences.gender !== userB.preferences.genderPref) return false;
  }

  return true;
}

// Main matchmaking scan
export async function scanAndMatch(userId: string): Promise<ChatSession | null> {
  const session = await getUserSession(userId);
  if (!session || session.status !== 'queuing') return null;

  const mode = session.mode;
  const topics = session.preferences.interests.length > 0
    ? session.preferences.interests
    : ['general'];

  // Retrieve candidates from the same topic queues, ordered by waiting time (oldest first)
  for (const topic of topics) {
    const qKey = queueKey(mode, topic.toLowerCase().trim());
    // Get all userIds in the queue (up to top 50, oldest first)
    const candidates = await redis.zrange(qKey, 0, 50);
    
    for (const candidateId of candidates) {
      if (candidateId === userId) continue;

      const candidateSession = await getUserSession(candidateId);
      if (!candidateSession) {
        // Clean up stale queue entries
        await redis.zrem(qKey, candidateId);
        continue;
      }

      if (areCompatible(session, candidateSession)) {
        // Try atomic transition
        const sessionId = `sess_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        const chatSession: ChatSession = {
          sessionId,
          userA: userId,
          userB: candidateId,
          mode,
          createdAt: Date.now(),
        };

        const success = await redis.tryMatchTransition(
          userKey(userId),
          userKey(candidateId),
          userQueuesKey(userId),
          userQueuesKey(candidateId),
          chatKey(sessionId),
          userId,
          candidateId,
          sessionId,
          JSON.stringify(chatSession),
          CONFIG.SESSION_TTL.toString()
        );

        if (success === 1) {
          console.log(`Matched user ${userId} and ${candidateId} in session ${sessionId} (Topic: ${topic})`);
          return chatSession;
        }
        // If transition failed (somebody else matched them or they disconnected), continue searching
      }
    }
  }

  return null;
}

// Clean up chat session
export async function destroyChatSession(sessionId: string): Promise<ChatSession | null> {
  const cKey = chatKey(sessionId);
  const data = await redis.get(cKey);
  if (!data) return null;

  const chatSession = JSON.parse(data) as ChatSession;
  await redis.del(cKey);

  // Transition remaining users to idle
  const pipeline = redis.pipeline();
  for (const uid of [chatSession.userA, chatSession.userB]) {
    const uKey = userKey(uid);
    const uData = await redis.get(uKey);
    if (uData) {
      const s = JSON.parse(uData) as UserSession;
      if (s.sessionId === sessionId) {
        s.status = 'idle';
        s.matchedWith = undefined;
        s.sessionId = undefined;
        pipeline.set(uKey, JSON.stringify(s), 'EX', CONFIG.SESSION_TTL);
      }
    }
  }
  await pipeline.exec();

  return chatSession;
}
