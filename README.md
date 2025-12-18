# Claude Mail

A terminal email client with intelligent priority scoring.

![Claude Mail](backend/assets/cover.png)

## What It Does

Automatically scores and categorizes your emails so you can focus on what matters:

- 🔴 **Urgent** - Needs immediate attention
- 🟠 **Important** - Handle today
- 🟢 **Normal** - Standard emails
- ⚫ **Low** - Newsletters, automated messages

The scoring uses RFC-compliant header analysis (not just keyword matching), so newsletters are correctly identified via List-Unsubscribe headers, auto-generated emails via Auto-Submitted headers, etc.

## Quick Start

```bash
git clone https://github.com/samay58/claude-mail.git
cd claude-mail

# First time setup
./setup.sh

# After setup, just run:
./start.sh
```

The setup script will:
1. Install Node.js and Go dependencies
2. Prompt you for Gmail credentials (requires [app password](https://myaccount.google.com/apppasswords))
3. Build the TUI

## Manual Setup

If you prefer to set things up yourself:

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with your Gmail credentials
npm run agent

# TUI (separate terminal)
cd tui
go build -o claudemail ./cmd/claudemail
./claudemail
```

## Requirements

- Node.js 18+
- Go 1.21+
- Gmail account with 2FA enabled and [app password](https://myaccount.google.com/apppasswords)
- (Optional) Deep Infra API key for AI features (quick replies, summaries)

## How It Works

Two components:

**backend/** - Node.js API server
- Syncs email via IMAP
- Stores in SQLite with full-text search
- Scores emails using 22 extracted features
- Exposes REST API on port 5178

**tui/** - Go terminal interface
- Built with [Bubble Tea](https://github.com/charmbracelet/bubbletea)
- Vim-style keyboard navigation
- Multi-pane layout with live preview

### Priority Scoring

Each email is analyzed for:
- RFC headers (List-Unsubscribe, Auto-Submitted, etc.)
- Sender relationship history (how often you reply to them)
- Content signals (questions, deadlines, urgency keywords)
- Thread context (are you expected to reply?)

The scoring is fully transparent - you can see exactly why each email got its score.

See [backend/CLAUDE.md](backend/CLAUDE.md) for the complete architecture.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j/k` | Navigate up/down |
| `Enter` | Open email |
| `c` | Compose |
| `r` | Reply |
| `t` | Toggle star |
| `s` | Sync |
| `X` | Clear all emails (with confirmation) |
| `/` | Search |
| `?` | Help |
| `q` | Quit (list view) |
| `Esc` | Back / close overlays |
| `v` | Toggle raw/clean email body (detail view) |
| `q` (detail) | Toggle quoted text (clean view only) |

## Configuration

User preferences are stored in `backend/config/`:
- `user.json` - Your name and signatures
- `user-preferences.json` - VIP contacts, important services

Copy from the `.example.json` files and customize.

## Project Structure

```
claude-mail/
├── backend/           # Node.js API
│   ├── src/
│   │   ├── agent/    # HTTP server
│   │   ├── core/     # Business logic
│   │   └── ...
│   └── config/
├── tui/               # Go terminal UI
│   ├── cmd/
│   └── internal/
├── start.sh           # Run everything
└── setup.sh           # First-time setup
```

## License

MIT
