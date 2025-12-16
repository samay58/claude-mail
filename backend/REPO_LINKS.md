# Repository Links

This project is part of the **Claude Mail** ecosystem - a modern terminal email client with AI-powered features.

## Connected Repositories

### 1. **claude-mail** (This Repository)
- **Purpose**: Node.js HTTP agent backend
- **Technology**: Node.js 18+, TypeScript, Express, SQLite
- **Repository**: https://github.com/samay58/claude-mail
- **Role**: Email operations (IMAP, SMTP), AI features, database management

### 2. **claude-mail-tui** (Frontend Client)
- **Purpose**: Go Bubble Tea TUI frontend
- **Technology**: Go 1.21+, Bubble Tea, Lipgloss
- **Repository**: https://github.com/samay58/claude-mail-tui
- **Role**: Terminal user interface, keyboard navigation, visual presentation

---

## Architecture

```
┌─────────────────┐         ┌──────────────┐
│   Go TUI        │  HTTP   │  Node Agent  │
│  (Bubble Tea)   │ <-----> │  (Express)   │
│    Frontend     │ :5178   │   THIS REPO  │
└─────────────────┘         └──────────────┘
                                   │
                           ┌───────┴────────┐
                           │                │
                       ┌───▼───┐      ┌────▼────┐
                       │ SQLite│      │  Gmail  │
                       │  FTS5 │      │  IMAP   │
                       └───────┘      └─────────┘
```

---

## Directory Structure

**IMPORTANT**: Both repositories must exist as siblings for proper operation:

```bash
# Clone both repositories into the same parent directory
git clone https://github.com/samay58/claude-mail.git
git clone https://github.com/samay58/claude-mail-tui.git

# Your folder structure:
parent-folder/
├── claude-mail/         # Backend API (this repo)
└── claude-mail-tui/     # Frontend TUI
```

The TUI expects the backend at `../claude-mail` relative to its directory.

---

## Quick Start

### 1. Start Backend (This Repo)
```bash
cd claude-mail
npm install
cp .env.example .env
# Edit .env with your Gmail credentials (see README for app password setup)
npm run agent  # Runs on port 5178
```

### 2. Start Frontend (Separate Terminal)
```bash
cd ../claude-mail-tui
go build -o claudemail ./cmd/claudemail
./claudemail
```

---

## API Endpoints

This server exposes HTTP endpoints for the TUI:

### Health & Stats
- `GET /health` - Server health check
- `GET /stats` - Email database statistics

### Email Operations
- `GET /emails` - List emails with filters
- `GET /emails/:id` - Get single email details
- `POST /compose` - Send new email
- `POST /reply` - Reply to email
- `PATCH /emails/:id` - Update email (read, starred, etc.)
- `DELETE /emails/:id` - Delete email

### AI Features
- `POST /ai/prioritize/:emailId` - Get AI priority score
- `POST /ai/quick-replies/:emailId` - Generate quick replies
- `POST /ai/draft-suggestions` - Generate draft suggestions

### Sync Operations
- `POST /sync` - Trigger email sync from IMAP

**Full API documentation**: See `src/agent/server.ts`

---

## Development Workflow

### Adding New API Endpoints
1. Add endpoint to `src/agent/server.ts`
2. Update TUI client: `../claude-mail-tui/internal/data/client.go`
3. Test with `curl` or TUI
4. Commit to both repositories

### Modifying Database Schema
1. Update `src/database.ts`
2. Test migrations
3. Update TUI data types if needed
4. Commit and coordinate with TUI updates

### Adding AI Features
1. Implement in `src/core/AIManager.ts`
2. Expose via API endpoint
3. Update TUI to use new feature
4. Commit to both repositories

---

## Documentation

### Backend (claude-mail)
- **README.md**: Project overview and setup
- **CLAUDE.md**: Complete architecture documentation
- **PROJECT_STATUS.md**: Current status and roadmap

### Frontend (claude-mail-tui)
- **README.md**: Quick start, features, keyboard shortcuts
- **MASTER_ROADMAP.md**: Complete project roadmap
- **SETUP.md**: Detailed installation guide

---

## Git Workflow

### Commit Pattern
```bash
git add .
git commit -m "feat: descriptive message"
git push origin main
```

### Coordinated Changes
- When changing API contracts, update TUI client code
- Document breaking changes in commit messages
- Test integration before pushing

---

## Troubleshooting

### Server Won't Start
- Check port 5178 is available: `lsof -i :5178`
- Verify `.env` file exists and has correct credentials
- Check Node.js version: `node --version` (need 18+)

### IMAP Sync Errors
- Verify Gmail app password in `.env`
- Check IMAP is enabled in Gmail settings
- Review error logs in console

### Database Issues
- Database auto-creates at `./data/emails.db`
- Delete `data/emails.db` to reset (will lose cached emails)
- SQLite temp files (`.db-shm`, `.db-wal`) are normal

---

## Security Notes

- **Never commit `.env` files** - Contains sensitive credentials
- **Gmail app passwords** - Use app-specific passwords, not account password
- **Local only** - Server runs on localhost:5178 (not exposed publicly)
- **User config files** - `config/user.json` and `config/user-preferences.json` are gitignored

---

_Last Updated: 2025-12-16_
