#!/bin/bash
# Setup script for Muninn v2
# 
# Usage:
#   ./setup.sh local    - Set up local PostgreSQL database
#   ./setup.sh neon     - Configure for Neon (requires DATABASE_URL)

set -e

MODE=${1:-local}

if [ "$MODE" = "local" ]; then
    echo "Setting up Muninn v2 with local PostgreSQL..."
    
    # Check if PostgreSQL is installed
    if ! command -v psql &> /dev/null; then
        echo "PostgreSQL not found. Please install PostgreSQL first."
        echo "On Ubuntu/Debian: sudo apt install postgresql"
        exit 1
    fi
    
    # Create database and user
    echo "Creating database and user..."
    sudo -u postgres psql -c "CREATE USER muninn WITH PASSWORD 'muninn';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE muninn_v2 OWNER muninn;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE muninn_v2 TO muninn;" 2>/dev/null || true
    
    # Create .env file
    echo "DATABASE_URL=postgresql://muninn:muninn@localhost:5432/muninn_v2" > .env
    echo "OPENAI_API_KEY=${OPENAI_API_KEY:-}" >> .env
    
    echo "Local PostgreSQL setup complete."
    echo "Run 'npm install && npm run migrate' to install dependencies and create tables."
    
elif [ "$MODE" = "neon" ]; then
    echo "Setting up Muninn v2 with Neon..."
    
    if [ -z "$DATABASE_URL" ]; then
        echo "DATABASE_URL environment variable required for Neon."
        echo "Get your connection string from https://console.neon.tech"
        echo ""
        echo "Example:"
        echo "  DATABASE_URL='postgresql://user:pass@ep-xxx.pooler.neon.tech/muninn?sslmode=require' ./setup.sh neon"
        exit 1
    fi
    
    echo "DATABASE_URL=$DATABASE_URL" > .env
    echo "OPENAI_API_KEY=${OPENAI_API_KEY:-}" >> .env
    
    echo "Neon configuration complete."
    echo "Run 'npm install && npm run migrate' to install dependencies and create tables."
else
    echo "Unknown mode: $MODE"
    echo "Usage: ./setup.sh [local|neon]"
    exit 1
fi