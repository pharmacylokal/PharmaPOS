#!/bin/bash
# PharmaPOS Start Script
# Starts both backend and frontend in parallel

echo "🏥 Starting PharmaPOS..."
echo ""
echo "Backend → http://localhost:3001"
echo "Frontend → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Start backend in background
cd backend && npm start &
BACKEND_PID=$!

# Give backend 2 seconds to start
sleep 2

# Start frontend
cd ../frontend && npm start &
FRONTEND_PID=$!

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
