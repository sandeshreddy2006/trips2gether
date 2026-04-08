#!/bin/bash

# Trips2gether Backend - Local SQLite Setup Script
# Run this to start the backend locally with SQLite database (no MySQL setup required)
# The data will be different from Railway deployment, but great for development testing

echo "Starting Trips2gether Backend Locally (SQLite)..."
echo ""

# Set environment variables for local development
echo "Setting environment variables..."

# SQLite Database (no MySQL setup required)
export DB_URL="sqlite:///./trips2gether.db"

# Environment (development mode - secure=False for HTTP cookies)
export ENVIRONMENT="development"

#Email utils
export SMTP_EMAIL="trips2gether07@gmail.com"
export SMTP_PASSWORD="***REDACTED***"

# JWT Configuration (use dummy values for local dev, change for production)
export JWT_SECRET="***REDACTED***"
export JWT_ALGO="HS256"
export JWT_TTL_SECONDS="604800"  # 7 days
export GOOGLE_PLACES_API="***REDACTED***"
export CLOUDFLARE_ACCOUNT_ID="8557e9773b5c16c07f55db5b2b6eaf75"
export CLOUDFLARE_API_TOKEN="***REDACTED***"

# reCAPTCHA (use dummy values for local dev, get real keys from Google Console)
export RECAPTCHA_SECRET_KEY="***REDACTED***"

# Google OAuth (optional for local testing without Google sign-in)
export NEXT_PUBLIC_GOOGLE_CLIENT_ID="486543762421-fhnulu6v6o18kab6hpe67gjq09gq340d.apps.googleusercontent.com"

echo "✓ Environment variables set:"
echo "  • DB_URL: SQLite (trips2gether.db)"
echo "  • ENVIRONMENT: development"
echo "  • JWT_SECRET: set to dummy value"
echo "  • RECAPTCHA_SECRET_KEY: set to dummy value"
echo ""

# Remove existing database file if it exists
echo "Cleaning up old database..."
if [ -f "trips2gether.db" ]; then
    rm trips2gether.db
    echo "Old database file deleted"
else
    echo "No existing database file found"
fi
echo ""
echo "Starting FastAPI server..."
echo ""
echo "Server info:"
echo "  • API: http://localhost:8000"
echo "  • Docs (Swagger UI): http://localhost:8000/docs"
echo "  • ReDoc: http://localhost:8000/redoc"
echo "  • Database: trips2gether.db (created automatically)"
echo ""
echo "Note: This is for LOCAL DEVELOPMENT only"
echo "  • Cookies use HTTP (not HTTPS)"
echo "  • reCAPTCHA is disabled (uses dummy key)"
echo "  • Data will reset when you delete trips2gether.db"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the FastAPI server with auto-reload and increased timeout
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --timeout-keep-alive 120

echo ""
echo "Goodbye! FastAPI server stopped"