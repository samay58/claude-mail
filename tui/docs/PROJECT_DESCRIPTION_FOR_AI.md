# Claude Mail TUI - Project Description for AI

**Purpose**: Provide a concise, accurate project overview when asking an AI system for improvements.
**Last Updated**: 2025-12-18

---

## Executive Summary

Claude Mail is a keyboard-first terminal email client with AI-native features and a priority scoring system inspired by Gmail Priority Inbox. The Go TUI provides a fast, focused workflow, while the Node.js backend handles IMAP sync, SMTP send, storage, scoring, and optional AI features.

Key UX priorities:
- **Speed + reliability**: instant-feeling search, snappy keyboard controls
- **Readable preview**: clean body extraction removes template/CSS noise
- **Focus**: minimal UI clutter, predictable overlays, and quick navigation

---

## Architecture Overview

```
[Go TUI (Bubble Tea)]
  - Three-pane UI
  - Keyboard-driven navigation
  - Search overlay + detail preview
          |
          | HTTP REST (localhost:5178)
          v
[Node.js Backend (Express + SQLite)]
  - IMAP fetch / SMTP send
  - FTS5 search + priority scoring
  - AI summaries + quick replies (opt)
          |
          v
  SQLite + FTS5 + IMAP + SMTP + AI API
```

**Repo layout**: monorepo
- `backend/` - TypeScript API server
- `tui/` - Go Bubble Tea TUI

---

## Core TUI Features

- **Inbox + Preview**: three-pane layout with live preview
- **Search**: `/` opens overlay; input stays focused; 2+ char gate
- **Clean body preview**: default clean text, `v` toggles raw, `q` toggles quoted
- **Batch operations**: select and bulk modify
- **AI features** (optional): summary + quick replies + drafts

---

## Key TUI Components

- `internal/app/app.go` - App orchestration and routing
- `internal/ui/inbox/inbox.go` - Email list table
- `internal/ui/preview/preview.go` - Detail view (clean/raw/quoted toggles)
- `internal/ui/search/search.go` - Search overlay + debounced queries
- `internal/ui/compose/compose.go` - Compose/reply/forward
- `internal/ui/nav/nav.go` - Views + smart bundles
- `internal/ui/quickreply/quickreply.go` - AI quick replies
- `internal/ui/help/help.go` - Shortcut overlay
- `internal/ui/toast/toast.go` - Notifications
- `internal/ui/statusbar/statusbar.go` - Connection/sync state

---

## Backend Notes (for UI work)

Important response fields:
- `bodyText`, `bodyHtml` (raw content)
- `bodyClean`, `bodyQuoted` (cleaned + quoted split)
- `priorityScore`, `priorityCategory`, `priorityReason`

Key endpoints:
- `GET /emails?view=&offset=&limit=&q=` (list + search)
- `GET /emails/:id` (detail, includes clean body)
- `POST /sync`, `/compose`, `/reply`
- `POST /emails/mark-read`, `/emails/star`, `/emails/delete`, `/emails/archive`

---

## Current Focus / Known Gaps

- **Search relevance**: improve ranking + fuzzy matching beyond prefix
- **Clean body persistence**: store `body_clean` for faster renders
- **Inbox declutter**: suppress template-heavy newsletters, collapse threads
- **Performance**: validate latency across large inboxes

---

## Where to Start for Improvements

1. `tui/internal/ui/search/search.go` (search UX + query flow)
2. `backend/src/database.ts` (search query building + FTS)
3. `backend/src/core/CleanBody.ts` (content cleanup heuristics)
4. `tui/internal/ui/preview/preview.go` (clean/raw/quoted rendering)
