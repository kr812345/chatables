import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { CONFIG } from './config';
import { websocketRoutes } from './websocket';

const fastify = Fastify({
  logger: true,
});

// Register CORS
fastify.register(cors, {
  origin: '*', // Allow connections from chrome extension popups (chrome-extension://*)
  methods: ['GET', 'POST'],
});

// Register WebSocket Plugin
fastify.register(fastifyWebsocket);

// Register Routes
fastify.register(async (instance) => {
  await websocketRoutes(instance);
});

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'OK', timestamp: Date.now() };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
    console.log(`Server is running at http://${CONFIG.HOST}:${CONFIG.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
