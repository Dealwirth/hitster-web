#!/usr/bin/env bash
# Keeps the HITSTER web server alive and writes logs to server.log.
set -u
cd "$(dirname "$0")/.."
while true; do
  node server/index.js >> server.log 2>&1
  code=$?
  echo "server exited (${code}) at $(date -Is); restarting in 2s" >> server.log
  sleep 2
done
