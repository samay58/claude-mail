# 📧 Claude Email Agent

![Claude Mail Cover Art](./assets/cover.png)

# Claude Email TUI

A terminal email client with Claude's brain and Bubble Tea's looks.

```
🔴 CEO just emailed about Q4 numbers                    Priority: 95
🟠 Sarah: Can you review the deployment plan?           Priority: 78
🟢 Team lunch moved to Thursday                         Priority: 62
⚫ [Newsletter] This week in JavaScript                 Priority: 15
```

Natural language search. AI-suggested replies. Priority scoring that actually works. All from your terminal, all with vim keybindings.

## Features that matter

**Claude integration**
Your emails get scored for priority using RFC signals—newsletters, auto-replies, and OTPs automatically sink to the bottom. Search with phrases like "emails about the API from last week" instead of cryptic filters. Get reply suggestions in multiple tones when you're stuck staring at a blank compose window.

**Terminal UI you'll actually enjoy**
Claude's signature orange theme. Split-pane view with inbox and preview. Real-time sync indicators. Keyboard shortcuts that feel natural if you've used vim (or any terminal tool that doesn't hate you).

**Real email client, not a toy**
IMAP/SMTP support for Gmail and other providers. SQLite with full-text search for instant results. Compose, reply, forward, star—everything works. Emails actually send.

## Get it running

Start the API server (handles IMAP, SQLite, Claude):

```bash
cd email-agent
npm install && npm run build

# Create .env with your Gmail app password
# Go to https://myaccount.google.com/security
# Enable 2FA → App passwords → Mail

AUTH_METHOD=imap
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your.email@gmail.com
IMAP_PASSWORD=your-16-char-app-password
ANTHROPIC_API_KEY=sk-ant-api...  # for AI features

npm run agent
```

Start the TUI (the interface you'll use):

```bash
cd ../claude-mail-tui
go build -o claudemail ./cmd/claudemail
./claudemail
```

Your inbox appears, priority-scored and ready.

## Navigation

The basics work like vim:

`j/k` move, `g/G` jump to top/bottom, Enter opens email

Actions are single keys:

`c` compose, `r` reply, `R` reply all, `f` forward, `t` star, `m` mark read/unread, `s` sync, `/` search, `q` quit

In composer:

Tab between fields, Ctrl+S sends, Ctrl+A shows AI suggestions, Esc cancels

Everything else you'd expect (page up/down, scroll, back to list) just works.

## Architecture

```
┌─────────────────────────────────┐
│   Go Bubble Tea TUI (Frontend)  │  ← What you see
│   Claude orange theme            │  ← Priority indicators
│   Keyboard navigation            │  ← Inbox, detail, compose
└────────────┬────────────────────┘
             │ HTTP/JSON on localhost:5178
┌────────────▼────────────────────┐
│  Node.js API Server (Backend)   │  ← Business logic
│  RFC-based priority scoring      │  ← 🔴🟠🟢⚫ calculation
│  SQLite + FTS5 for search        │  ← Email storage
│  IMAP/SMTP sync                  │  ← Gmail connection
│  Claude AI integration           │  ← Smart features
└──────────────────────────────────┘
```

Priority scoring uses RFC standards: newsletters (2369/2919), auto-replies (3834), calendar invites (5545), OTPs (6238) all get filtered down automatically.

## Tech

**Frontend:** Go, Bubble Tea, Lipgloss  
**Backend:** TypeScript, Express, SQLite with FTS5, Claude AI (Haiku)  
**Email:** IMAP/SMTP with Gmail app passwords

Built with Bubble Tea and Claude. No electrons were harmed.
