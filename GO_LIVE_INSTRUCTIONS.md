# 🚀 GO LIVE INSTRUCTIONS - Claude Email Agent

## ✨ What's New in v2.0

1. **IMAP Authentication with App Passwords** ✓
   - No OAuth verification needed!
   - Simple 16-character app password
   - Works immediately with Gmail

2. **Beautiful Terminal UI** ✓
   - Claude orange branding (#FF6B35)
   - Elegant status bar with connection status
   - Visual email indicators (unread, starred, priority)
   - Smooth animations and spinners

3. **Claude AI Integration** ✓
   - Natural language search
   - Smart reply generation
   - Email summarization

## 📋 Quick Setup Guide

### Option 1: Interactive Setup (Recommended)
```bash
# Install dependencies
npm install

# Run the interactive setup wizard
node scripts/app-password-setup.js
```

The wizard will guide you through:
1. Enabling 2-Factor Authentication on Gmail
2. Generating an app-specific password
3. Testing the connection
4. Saving credentials automatically

### Option 2: Manual Setup

#### Step 1: Enable 2FA on Gmail
1. Go to https://myaccount.google.com/security
2. Click "2-Step Verification"
3. Follow the setup process

#### Step 2: Generate App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select app: "Mail"
3. Select device: "Other (Custom name)"
4. Enter name: "Claude Email Agent"
5. Click "Generate"
6. Copy the 16-character password (ignore spaces)

#### Step 3: Configure .env File
```env
# Authentication Method
AUTH_METHOD=imap

# IMAP Configuration
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-16-char-app-password

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## 🚀 Running the Application

### Build the Project
```bash
# Build TypeScript files
npm run build

# Build the MCP services
cd services/mcp-gmail && npm run build && cd ../..
```

### Start the TUI
```bash
# Run the beautiful terminal UI
npm run tui

# Or from the apps/tui directory
cd apps/tui && npm start
```

## 🎮 How to Use

### Keyboard Shortcuts
- **`/`** - Open search (shows SQL translation panel)
- **`j/k` or `↓/↑`** - Navigate emails
- **`Enter`** - Open selected email
- **`r`** - Reply to current email
- **`d`** - Delete email
- **`a`** - Archive email
- **`Tab`** - Switch between panels
- **`q`** - Quit

### Natural Language Search Examples
Try these searches:
- "Show me unread emails from this week"
- "Find emails about meetings"
- "Emails from john with attachments"
- "Important emails from yesterday"

Watch the SQL translation panel show how your query converts to SQL!

## 🔥 Features Available

1. **Claude-Powered Search**
   - Natural language understanding
   - SQL generation and display
   - Intelligent filtering

2. **Smart Email Display**
   - Priority indicators (! for urgent, ⚡ for follow-ups)
   - Sender initials
   - Relative timestamps
   - Unread markers (orange dots)

3. **AI Replies**
   - Matches your writing style
   - Safety checks for sensitive content
   - Draft preview before sending

## 🐛 Troubleshooting

### If OAuth fails:
1. Make sure you're using port 3000 (the script uses http://localhost:3000)
2. Check that your Google Cloud project has Gmail API enabled
3. Verify credentials match in .env and Google Cloud Console

### If emails don't load:
1. Check internet connection
2. Verify refresh token is set correctly
3. Try regenerating the token with `node scripts/oauth-setup.js`

### If search doesn't work:
1. Ensure ANTHROPIC_API_KEY is valid
2. Check you have API credits available
3. Try a simpler query first

## 📊 Performance Expectations

With real Gmail:
- Initial load: 2-3 seconds for 50 emails
- Search: < 1 second for metadata
- Reply generation: 1-2 seconds
- Navigation: Instant

## 🎨 Visual Features

The new TUI includes:

```
╔═══════════════════════════════════════════════════════╗
║  ✉ Claude Email Agent  │  Connected  │  1,234 emails  ║
╠═══════════════════════════════════════════════════════╣
║ 📥 Inbox — Showing 10 of 234 emails                   ║
╟───────────────────────────────────────────────────────╢
║ ▶ ● ! ★ [JD] John Doe      — Meeting tomorrow?    2h  ║
║   ○   ☆ [SC] Sarah Chen    — Re: Project update  12h  ║
║   ● ⚡ ☆ [AK] Alex Kumar    — Action required      1d  ║
╚═══════════════════════════════════════════════════════╝
```

**Visual Indicators:**
- `●` Unread email (orange)
- `○` Read email (gray)
- `★` Starred/Important
- `!` Urgent/Priority
- `⚡` Action required
- `[XX]` Sender initials

## 🚦 Ready Checklist

Before going live, confirm:
- [ ] `.env` file has all keys (Anthropic, Gmail)
- [ ] OAuth refresh token generated
- [ ] `npm run build` completes without errors
- [ ] Terminal is at least 80x24 characters
- [ ] You're in an interactive terminal (not SSH)

## 🎉 You're Ready!

Run `npm start` and enjoy your AI-powered email experience with:
- Real Gmail integration
- Claude AI search and replies
- Beautiful terminal UI
- Keyboard-driven efficiency

The Claude Email Agent is now LIVE! 🚀