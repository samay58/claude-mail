# 📧 Claude Email Agent

![Claude Mail Cover Art](./assets/cover.png)

An intelligent terminal-based email client powered by Claude AI that brings natural language search, smart replies, and enhanced email management to your inbox.

**Primary Interface**: Beautiful Go Bubble Tea TUI with RFC-compliant priority scoring

![Claude Email Agent](https://img.shields.io/badge/Powered%20by-Claude-FF6B35?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![Terminal](https://img.shields.io/badge/Terminal-4D4D4D?style=for-the-badge&logo=windows-terminal&logoColor=white)

## ✨ Features

### 🎯 Core Functionality
- **Full Email Management**: Read, reply, forward, and compose emails
- **IMAP/SMTP Support**: Works with Gmail and other email providers
- **SQLite Database**: Fast local storage with full-text search
- **Real Email Sending**: Fully functional email client, not just a viewer

### 🤖 AI-Powered Intelligence (Claude)
- **Smart Reply Generation**: Get AI-suggested responses in multiple tones
- **Email Prioritization**: Automatic importance scoring and categorization
- **Semantic Search**: Natural language queries like "emails from last week about project"
- **Sender Profiling**: Learn communication patterns and styles
- **Quick Replies**: One-click response suggestions

### 🎨 Beautiful Terminal UI
- **Claude-Themed Interface**: Signature orange (#FF6B35) aesthetic
- **Full Keyboard Navigation**: Vim-style shortcuts (j/k, g/G, etc.)
- **Multiple Views**: List view, detail view, composer, search
- **Real-Time Updates**: Live sync status and progress indicators
- **Split Layout**: Email list + preview in main view

## 🚀 Quick Start

### **Step 1: Start the Backend API Server**

```bash
cd email-agent
npm install
npm run build

# Configure .env file (Gmail App Password required)
# 1. Go to https://myaccount.google.com/security
# 2. Enable 2-Factor Authentication
# 3. Go to "App passwords" and generate one for "Mail"

# Create .env with:
AUTH_METHOD=imap
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your.email@gmail.com
IMAP_PASSWORD=your-16-char-app-password
ANTHROPIC_API_KEY=sk-ant-api...  # Optional, for AI features

# Start the API server (runs on port 5178)
npm run agent
```

### **Step 2: Start the Go TUI Client** (Primary Interface)

```bash
cd ../claude-mail-tui
go build -o claudemail ./cmd/claudemail
./claudemail
```

You'll see the beautiful terminal interface with priority-scored emails! 🎉

**Priority Indicators:**
- 🔴 **Urgent** (≥90): Immediate attention required
- 🟠 **Important** (70-89): High priority, respond today
- 🟢 **Normal** (50-69): Standard emails
- ⚫ **Low** (30-49): Optional, low priority
- Newsletters and OTPs automatically filtered as low priority!

## ⌨️ Keyboard Shortcuts

### Navigation
- `j/k` or `↑/↓` - Navigate emails
- `g/G` - Jump to top/bottom
- `Space` or `PgDn` - Page down
- `PgUp` - Page up
- `Enter` - Open email details

### Actions
- `c` - Compose new email
- `r` - Reply to current email
- `R` - Reply all
- `f` - Forward email
- `t` - Toggle star
- `m` - Mark as read/unread
- `s` - Sync emails from server
- `/` - Search emails
- `q` - Quit application

### In Email View
- `ESC` or `q` - Back to list
- `j/k` - Scroll content
- All reply/forward shortcuts work here too

### In Composer
- `Tab/Shift+Tab` - Navigate fields
- `Ctrl+S` - Send email
- `Ctrl+D` - Save draft
- `Ctrl+A` - Show AI suggestions (when available)
- `ESC` - Cancel

## 🏗️ Architecture

### **Two-Tier Design**

```
┌─────────────────────────────────┐
│   Go Bubble Tea TUI (Frontend)  │  ← Primary user interface
│   - Beautiful terminal UI        │  ← Priority indicators (🔴🟠🟢⚫)
│   - Keyboard navigation          │  ← Inbox, detail, compose views
│   - Real-time updates            │
└────────────┬────────────────────┘
             │ HTTP/JSON
             │ localhost:5178
┌────────────▼────────────────────┐
│  Node.js API Server (Backend)   │  ← Business logic layer
│  - RFC-compliant feature extract │  ← Priority scoring engine
│  - SQLite + FTS5 database        │  ← Email storage & search
│  - IMAP/SMTP email sync          │  ← Gmail/email provider
│  - Claude AI integration         │  ← Smart replies & analysis
└──────────────────────────────────┘
```

### **Key Technologies**

**Frontend (Go TUI)**:
- **Go + Bubble Tea** - Modern terminal UI framework
- **Lipgloss** - Styling and theming
- **HTTP Client** - API communication

**Backend (Node.js API)**:
- **TypeScript** - Type-safe throughout
- **Express** - REST API server
- **SQLite + FTS5** - Fast local database with full-text search
- **RFC-Based Scoring** - Newsletter (RFC 2369/2919), Auto-gen (RFC 3834), Calendar (RFC 5545), OTP (RFC 6238)
- **Claude AI (Haiku)** - Optional AI features (smart replies, summaries)
- **IMAP/SMTP** - Email sync and sending

---

Built with ❤️ using Claude AI