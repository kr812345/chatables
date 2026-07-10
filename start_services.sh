#!/bin/bash

# Define directories
PROJECT_ROOT="/home/krishna/Documents/Code/experiments/chatables"
BACKEND_DIR="$PROJECT_ROOT/backend"
DOMAIN="mallard-tidy-rhino.ngrok-free.app"

echo "============================================="
echo "🦊 Chatables Service Suite Manager"
echo "============================================="

# 1. Start the Fastify backend server
echo "Starting Fastify signaling server..."
cd "$BACKEND_DIR"
npm run dev &
BACKEND_PID=$!

# Register exit handler to automatically kill the background server on exit (Ctrl + C)
cleanup() {
  echo ""
  echo "============================================="
  echo "🛑 Shutting down services..."
  echo "Stopping Fastify server (PID: $BACKEND_PID)..."
  kill "$BACKEND_PID" 2>/dev/null || true
  echo "Clean shutdown complete!"
  echo "============================================="
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 2. Wait for port 3000 to become active
echo "Waiting for backend to bind to port 3000..."
sleep 3

# 3. Start the ngrok tunnel
echo "Launching ngrok tunnel on: https://$DOMAIN"
echo "Press [Ctrl + C] to exit both services."
echo "============================================="
ngrok http --url="$DOMAIN" 3000
