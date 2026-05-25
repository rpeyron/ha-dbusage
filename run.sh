#!/usr/bin/env bash
# DB Insights Add-on startup script

set -e

cd /app

# Start the server from compiled output
npm start
