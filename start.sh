#!/bin/bash
# Claude Mail launcher - starts backend and TUI

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() {
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Check if backend is already running
if lsof -ti:5178 > /dev/null 2>&1; then
    echo -e "${GREEN}Backend already running on port 5178${NC}"
else
    echo "Starting backend..."
    cd backend
    npm run agent > /tmp/claude-mail-backend.log 2>&1 &
    BACKEND_PID=$!
    cd ..

    # Wait for backend to be ready
    for i in {1..20}; do
        if curl -s http://localhost:5178/health > /dev/null 2>&1; then
            echo -e "${GREEN}Backend ready${NC}"
            break
        fi
        sleep 0.5
    done

    if ! curl -s http://localhost:5178/health > /dev/null 2>&1; then
        echo -e "${RED}Backend failed to start. Check /tmp/claude-mail-backend.log${NC}"
        exit 1
    fi
fi

# Build TUI if needed
if [ ! -f tui/claudemail ]; then
    echo "Building TUI..."
    cd tui
    go build -o claudemail ./cmd/claudemail
    cd ..
fi

# Run TUI
cd tui
./claudemail
