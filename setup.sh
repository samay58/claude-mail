#!/bin/bash
# Claude Mail first-time setup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Claude Mail Setup"
echo "================="
echo

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js not found. Please install Node.js 18+."
    exit 1
fi
echo "Node.js: $(node --version)"

# Check Go
if ! command -v go &> /dev/null; then
    echo "Error: Go not found. Please install Go 1.21+."
    exit 1
fi
echo "Go: $(go version | cut -d' ' -f3)"
echo

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
cd ..
echo

# Create .env if it doesn't exist
if [ ! -f backend/.env ]; then
    echo "Setting up Gmail credentials..."
    echo
    echo "You need a Gmail App Password (not your regular password)."
    echo "Get one at: https://myaccount.google.com/apppasswords"
    echo

    read -p "Gmail address: " EMAIL
    read -sp "App password (16 characters): " PASSWORD
    echo

    cat > backend/.env << EOF
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=$EMAIL
IMAP_PASSWORD=$PASSWORD

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$EMAIL
SMTP_PASSWORD=$PASSWORD

# Optional: Anthropic API key for AI features
# ANTHROPIC_API_KEY=sk-ant-...
EOF

    echo "Credentials saved to backend/.env"
else
    echo "backend/.env already exists, skipping credential setup"
fi
echo

# Copy example config files if needed
if [ ! -f backend/config/user.json ]; then
    cp backend/config/user.example.json backend/config/user.json
    echo "Created backend/config/user.json (edit to customize)"
fi

if [ ! -f backend/config/user-preferences.json ]; then
    cp backend/config/user-preferences.example.json backend/config/user-preferences.json
    echo "Created backend/config/user-preferences.json (edit to customize)"
fi
echo

# Build TUI
echo "Building TUI..."
cd tui
go build -o claudemail ./cmd/claudemail
cd ..
echo

echo "Setup complete!"
echo
echo "To start Claude Mail, run:"
echo "  ./start.sh"
