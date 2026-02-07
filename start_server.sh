#!/bin/bash

# Define the port
PORT=8000

# Check if port is in use and kill the process if so
PID=$(lsof -ti :$PORT)
if [ -n "$PID" ]; then
  echo "Stopping existing server on port $PORT (PID: $PID)..."
  kill -9 $PID
fi

# Start the server in the background
echo "Starting WIISER server on port $PORT..."
nohup python3 -m http.server $PORT > server.log 2>&1 &

echo "Server is running in the background."
echo "Access at: http://localhost:$PORT"
echo "Logs are being written to server.log"
