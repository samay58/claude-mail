# 📧 Claude Email Agent

An intelligent terminal-based email client powered by Claude AI that brings natural language search, smart replies, and enhanced email management to your inbox.

![Claude Email Agent](https://img.shields.io/badge/Powered%20by-Claude-FF6B35?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
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

```bash
# Clone and install
git clone https://github.com/yourusername/email-agent.git
cd email-agent
npm install

# Configure Gmail App Password
# 1. Go to https://myaccount.google.com/security
# 2. Enable 2-Factor Authentication
# 3. Go to "App passwords" and generate one for "Mail"

# Create .env file
EMAIL_ADDRESS=your.email@gmail.com
EMAIL_APP_PASSWORD=your-16-char-app-password
ANTHROPIC_API_KEY=sk-ant-api...  # Optional, for AI features

# Run
npm start        # Start the TUI email client
npm run dev      # Development mode
npm run build    # Build TypeScript
```

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

- **TypeScript** - Type-safe throughout
- **React + Ink** - Modern TUI framework for terminal interfaces
- **SQLite + FTS5** - Fast local database with full-text search
- **Claude AI (Haiku)** - Efficient AI model for email intelligence
- **IMAP/SMTP** - Standard email protocols for universal compatibility
- **Component-based** - Modular design with reusable UI components

---

Built with ❤️ using Claude AI