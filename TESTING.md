# 📧 Claude Email Agent - Testing Instructions

## Prerequisites

Ensure you have Node.js 18+ installed and you're in the project directory.

## Quick Test with Mock Data

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run with mock data (no email credentials needed)
node dist/index.js start --mock
```

## What You'll See

When running with mock data, the app will:

1. Show the Claude-themed logo
2. Initialize with 50 mock emails
3. Display a terminal UI with:
   - **Left panel**: Inbox list with email subjects
   - **Right top panel**: Email content viewer
   - **Right bottom panel**: Draft editor
   - **Bottom**: Status bar with shortcuts

## Keyboard Controls

- `j/k` or `↓/↑` - Navigate emails
- `Enter` - Open selected email
- `/` - Search (shows SQL translation animation)
- `r` - Reply to current email
- `d` - Delete email
- `a` - Archive email
- `Tab` - Cycle between panels
- `q` - Quit application

## Troubleshooting

### UI Not Displaying

The terminal UI requires an interactive TTY session. If running through SSH or in a non-interactive environment:

1. Ensure your terminal supports ANSI colors and Unicode
2. Try running directly in a local terminal
3. Check terminal size is at least 80x24 characters

### Screen Flashes and Exits

This can happen if:
- Terminal doesn't support the blessed library
- Running in a CI/CD environment
- Using Windows Command Prompt (use Windows Terminal or WSL instead)

### Test Individual Components

```bash
# Test the blessed library
node test-blessed.js

# If this shows a blue box with "Hello world!", blessed is working
```

## Testing with Real Gmail

To test with real Gmail, you need:

1. Create a `.env` file:
```env
ANTHROPIC_API_KEY=your_claude_api_key
GMAIL_CLIENT_ID=your_oauth_client_id
GMAIL_CLIENT_SECRET=your_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
```

2. Run without --mock flag:
```bash
node dist/index.js start
```

## Visual Verification

The UI should match these characteristics:
- **Claude Orange** (#FF6B35) accent colors
- **Dark theme** with #1a1b26 background
- **Real-time updates** in status bar
- **Smooth animations** for search SQL translation

## Performance Targets

With mock data, you should see:
- Instant email list display
- < 100ms navigation between emails
- Smooth scrolling through 50+ emails

## Known Issues

1. **Non-TTY environments**: The app requires an interactive terminal
2. **Small terminals**: Minimum 80x24 size recommended
3. **SSH sessions**: May have display issues depending on client

## Development Testing

For development with hot reload:
```bash
# Install TypeScript watcher
npm install -g nodemon ts-node

# Run in development mode
nodemon --exec ts-node src/index.ts start --mock
```

## Success Criteria

✅ App launches without errors
✅ Mock emails display in inbox
✅ Can navigate with j/k keys
✅ Search bar opens with `/` key
✅ Email content displays on selection
✅ Status bar shows keyboard shortcuts
✅ Can quit cleanly with `q` key

---

If all checks pass, the email agent is working correctly! 🎉