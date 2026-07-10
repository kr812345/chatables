# Chatables Backend Deployment Guide

This guide explains how to deploy the Fastify WebSocket signaling server and Redis matchmaking engine to production.

---

## ⚠️ Important: Why Vercel/Netlify Will Not Work
**Vercel** and **Netlify** are serverless platforms designed for ephemeral HTTP functions. 
- **WebSocket Block**: Serverless functions execute on-demand, return a response, and shut down. They **cannot maintain persistent TCP/WebSocket connections** required for WebRTC signaling.
- **State Management**: Serverless environments do not have a persistent background thread, which would break the active matchmaking queue.

To host a WebSocket signaling server, you must use a **persistent application hosting provider** (virtual machines or container runners).

---

## Option 1: Deployment on Railway (Recommended)
**Railway.app** is the easiest platform for this stack because it automatically reads your `docker-compose.yml` or `Dockerfile` and spins up the Node.js app alongside a Redis instance in minutes.

### Steps:
1. **Create a Railway Account**: Sign up at [Railway.app](https://railway.app).
2. **Install the CLI or Connect GitHub**:
   - Connect your GitHub repository containing the Chatables codebase to Railway.
3. **Provision Redis**:
   - In your Railway project dashboard, click **New** → **Database** → **Redis**.
   - Copy the **Redis Connection URL** (e.g., `redis://default:password@host:port`).
4. **Deploy the Fastify Service**:
   - Click **New** → **GitHub Repo** → select your repository.
   - Set the root directory of the deploy to `/backend` (so it builds using `backend/Dockerfile`).
5. **Configure Environment Variables**:
   In the Fastify service settings, add the following variables:
   - `PORT` = `3000` (Railway will assign this automatically, or read the port they expose as `$PORT`)
   - `HOST` = `0.0.0.0`
   - `REDIS_URL` = `${{Redis.REDIS_URL}}` (Railway reference to your provisioned database, or paste the connection string)
   - `SESSION_TTL` = `1800` (30 minutes)
   - `COOLDOWN_TTL` = `900` (15 minutes)
6. **Expose Public URL**:
   - Go to your Fastify service settings in Railway and click **Generate Domain**. Railway will provide a public HTTPS/WSS URL (e.g., `https://chatables-production.up.railway.app`).
   - Change your extension WebSocket URL in settings to: `wss://chatables-production.up.railway.app/chat`.

---

## Option 2: Deployment on Render
**Render.com** offers simple, persistent Web Service hosting and managed Redis instances.

### Steps:
1. **Create Render Redis**:
   - Go to [Render.com](https://render.com) and create a **Redis** instance.
   - Copy the internal Redis connection string (e.g., `redis://red-abc1234:6379`).
2. **Create Render Web Service**:
   - Click **New +** → **Web Service**.
   - Connect your GitHub repository.
   - Set **Runtime** to `Docker`.
   - Set **Docker Path** to `./backend/Dockerfile`.
3. **Configure Environment Variables**:
   - `REDIS_URL` = `redis://your-internal-render-redis-url`
   - `SESSION_TTL` = `1800`
   - `COOLDOWN_TTL` = `900`
4. Render will deploy your container and provide a `https://[app-name].onrender.com` address. Secure WebSockets will route through `wss://[app-name].onrender.com/chat`.

---

## Option 3: Deployment on Fly.io (VPS/MicroVMs)
**Fly.io** runs Docker containers physically close to your users, minimizing signaling latency.

### Steps:
1. **Install flyctl CLI** and run `fly auth login`.
2. **Deploy Redis**:
   - Create a KeyDB or Redis instance on Fly:
     ```bash
     fly redis create
     ```
   - Copy the connection URL.
3. **Deploy Backend**:
   - Navigate to `/backend` and initialize deployment:
     ```bash
     fly launch
     ```
   - Select Dockerfile configuration. Set the port mapping to external `80` (HTTP) / `443` (HTTPS) to internal `3000`.
   - Set the `REDIS_URL` secret:
     ```bash
     fly secrets set REDIS_URL="redis://your-redis-url"
     ```
   - Run `fly deploy`.

---

## 🔒 Extension Configuration Update
Once deployed, change the connection URL inside your extension:
1. Open the **Chatables** settings gear ⚙️.
2. Replace `ws://localhost:3000/chat` with your secure production URL, for example:
   `wss://chatables-production.up.railway.app/chat`
3. Click **Save**.
