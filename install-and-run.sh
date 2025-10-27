#!/bin/bash

echo "🎨 Installing Gorgeous Claude Email TUI..."

# Ensure we're in the right directory
cd /Users/samaydhawan/email-agent

echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
    echo ""
    echo "🚀 Starting the gorgeous TUI..."
    echo ""
    npm run tui
else
    echo "❌ Installation failed. Let's try with yarn:"
    yarn install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed with yarn!"
        echo "🚀 Starting TUI..."
        yarn tui
    else
        echo "❌ Please run manually:"
        echo "   cd /Users/samaydhawan/email-agent"
        echo "   npm install"
        echo "   npm run tui"
    fi
fi