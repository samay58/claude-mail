#!/bin/bash

echo "🎯 Setting up streamlined Claude Email Agent..."

# Backup old system
echo "📦 Backing up old system..."
if [ -d "old-system" ]; then
    rm -rf old-system
fi
mkdir old-system

# Move old files to backup
mv src old-system/ 2>/dev/null || true
mv apps old-system/ 2>/dev/null || true
mv services old-system/ 2>/dev/null || true
mv package.json old-system/ 2>/dev/null || true
mv package-lock.json old-system/ 2>/dev/null || true
mv tsconfig.json old-system/ 2>/dev/null || true

echo "✅ Old system backed up to old-system/"

# Move new files to main locations
echo "🚀 Installing new streamlined system..."

mv package-new.json package.json
mv src-new src
mv client-new client
mv .env-new .env

echo "✅ New system installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo "✅ Dependencies installed"

# Create data directory
mkdir -p data

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Verify your .env file has correct Gmail credentials"
echo "2. Run: npm run dev"
echo "3. Open: http://localhost:3000"
echo ""
echo "🔧 Your email credentials are already configured:"
echo "   EMAIL_ADDRESS=samay58@gmail.com"
echo "   EMAIL_APP_PASSWORD=[configured]"
echo ""
echo "⚡ The new system will:"
echo "   - Fetch real emails via IMAP"
echo "   - Store them in SQLite database"
echo "   - Show them in a beautiful web interface"
echo "   - Sync automatically on startup"
echo ""
echo "🚀 Ready to run: npm run dev"