import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Heartbeats & Timeouts
  PING_INTERVAL_MS: parseInt(process.env.PING_INTERVAL_MS || '20000', 10),
  PING_TIMEOUT_MS: parseInt(process.env.PING_TIMEOUT_MS || '10000', 10),
  
  // TTLs in seconds
  SESSION_TTL: parseInt(process.env.SESSION_TTL || '1800', 10), // 30 mins
  QUEUE_TTL: parseInt(process.env.QUEUE_TTL || '300', 10),     // 5 mins
  COOLDOWN_TTL: parseInt(process.env.COOLDOWN_TTL || '900', 10), // 15 mins
  
  // Coturn configurations (optional, we can fall back to public STUN/TURN if not specified)
  TURN_URL: process.env.TURN_URL || '',
  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',
  STUN_URLS: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(','),
};
