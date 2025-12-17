#!/bin/bash
sqlite3 "$(dirname "$0")/backend/data/emails.db" "DELETE FROM emails; DELETE FROM ai_cache; DELETE FROM message_features; VACUUM;"
echo "✅ Cleared"
