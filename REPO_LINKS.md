# Repository Links

This project is part of the **Claude Mail** ecosystem - a modern terminal email client with AI-powered features.

## 🔗 Connected Repositories

### 1. **email-agent** (This Repository)
- **Purpose**: Node.js HTTP agent backend
- **Technology**: Node.js 18+, TypeScript, Express, SQLite
- **Location**: `/Users/samaydhawan/email-agent`
- **Repository**: https://github.com/samay58/claude-mail.git
- **Role**: Email operations (IMAP, SMTP), AI features, database management

### 2. **claude-mail-tui** (Frontend Client)
- **Purpose**: Go Bubble Tea TUI frontend
- **Technology**: Go 1.21+, Bubble Tea, Lipgloss
- **Location**: `/Users/samaydhawan/claude-mail-tui`
- **Repository**: Local only (not on GitHub)
- **Role**: Terminal user interface, keyboard navigation, visual presentation

---

## 🏗️ Architecture

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

## 📂 Directory Structure Requirement

**IMPORTANT**: Both repositories must exist as siblings for proper operation:

```
/Users/samaydhawan/
├── email-agent/         # This repo (backend)
└── claude-mail-tui/     # Frontend repo
```

The TUI expects to find this agent at `../email-agent` from its directory.

---

## 🚀 Setup & Running

### 1. Start This Server (Email Agent)
```bash
cd /Users/samaydhawan/email-agent
npm install
cp .env.example .env
# Edit .env with your credentials
npm run agent  # Runs on port 5178
```

### 2. Run the TUI Client (In Separate Terminal)
```bash
cd /Users/samaydhawan/claude-mail-tui
go build -o claude-mail cmd/claudemail/main.go
./claude-mail
```

---

## 🌐 API Endpoints

This server exposes the following HTTP endpoints for the TUI:

### Health & Stats
- `GET /health` - Server health check
- `GET /stats` - Email database statistics

### Email Operations
- `GET /emails` - List emails with filters
- `GET /emails/:id` - Get single email details
- `POST /emails` - Send new email
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

## 🔄 Development Workflow

### Adding New API Endpoints
1. Add endpoint to `src/agent/server.ts`
2. Update TUI client: `claude-mail-tui/internal/data/client.go`
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

## 📚 Documentation

### This Repository (email-agent)
- **README**: Project overview and setup
- **CLAUDE.md**: Complete architecture documentation
- **API Docs**: See `src/agent/server.ts` comments

### TUI Repository (claude-mail-tui)
- **README.md**: Quick start, features, keyboard shortcuts
- **MASTER_ROADMAP.md**: Complete project roadmap
- **NEXT_STEPS.md**: Current phase tasks

---

## 🤝 Git Workflow

### This Repository Strategy

**Main Branch**: `main` on GitHub
**Remote**: https://github.com/samay58/claude-mail.git

**Commit Pattern:**
```bash
git add .
git commit -m "feat: descriptive message"
git push origin main
```

**Coordinated Changes:**
- When changing API contracts, update TUI client code
- Document breaking changes in commit messages
- Test integration before pushing

---

## 🔧 Troubleshooting

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
- Delete `data/emails.db` to reset (will lose emails)
- SQLite temp files (`.db-shm`, `.db-wal`) are normal

---

## 📊 Current Status

- **email-agent**: Commit `3729592` - HTTP agent server complete
- **claude-mail-tui**: Commit `6c2a015` - Phase 5 complete (75% overall)
- **Integration**: Fully functional on port 5178
- **Next**: Phase 6 - Performance & Testing

---

## 🔐 Security Notes

- **Never commit `.env` files** - Contains sensitive credentials
- **Gmail app passwords** - Use app-specific passwords, not account password
- **Local only** - Server runs on localhost:5178 (not exposed publicly)
- **CORS enabled** - Only for local development

---

_Last Updated: 2025-10-27_
