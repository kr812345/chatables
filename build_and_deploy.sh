#!/bin/bash

# Exit on error
set -e

# Define directories
PROJECT_ROOT="/home/krishna/Documents/Code/experiments/chatables"
EXTENSION_DIR="$PROJECT_ROOT/extension"
DEST_DIR="/mnt/c/Users/Krishna/Documents/Code/chatables-extension"

echo "============================================="
echo "🚀 Building Chatables Chrome Extension"
echo "============================================="

# Navigate to extension directory
cd "$EXTENSION_DIR"

# Run TypeScript compile and Vite build
echo "Running Vite build..."
npm run build

echo ""
echo "============================================="
echo "📂 Deploying to Windows Filesystem"
echo "============================================="

# Ensure target folder exists on Windows partition
echo "Ensuring destination directory exists: $DEST_DIR"
mkdir -p "$DEST_DIR"

# Clear out any stale files from prior builds
echo "Cleaning old build files..."
rm -rf "${DEST_DIR:?}"/*

# Copy build contents recursively
echo "Copying build files to $DEST_DIR..."
cp -r dist/* "$DEST_DIR/"

echo ""
echo "============================================="
echo "🎉 Deployment Success!"
echo "============================================="
echo "Unpacked build is now ready to be loaded in Chrome."
echo "Path in Windows Chrome (Load Unpacked):"
echo "C:\\Users\\Krishna\\Documents\\Code\\chatables-extension"
echo "============================================="
