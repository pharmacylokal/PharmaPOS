#!/bin/bash
# PharmaPOS Setup Script
# Run this once on first install

echo "🏥 Setting up PharmaPOS..."
echo ""

# Backend setup
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Frontend setup
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the system, run: ./start.sh"
