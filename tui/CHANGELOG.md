# Changelog

All notable changes to the Claude Mail TUI (Go Bubble Tea frontend) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - 2025-10-28

- **Sync Status Indicator**: Status bar now shows "⟳ Syncing..." during email sync
- **Sync Completion Feedback**: Toast messages show "Sync complete" or "No new emails"
- **Automatic Inbox Refresh**: Inbox automatically refreshes after sync completes
- **SyncResponse Parsing**: Client now parses detailed sync response from backend

### Fixed - 2025-10-28

- **Sync Reliability**: Sync now waits for completion instead of fire-and-forget
- **User Feedback**: Clear visual indication of sync status and results
- **Email Display**: New emails appear immediately after sync without manual navigation

### Changed - 2025-10-28

- `Client.TriggerSync()` now returns `(*SyncResponse, error)` with detailed status
- Added `SyncStartedMsg` and `SyncCompletedMsg` message types
- Inbox sync handler now properly integrates with status bar

---

## [1.0.0] - 2025-10-27

### Phase 5.5 Complete

- **IMAP Reconnection**: Automatic reconnection with exponential backoff
- **Auto-Prioritization**: Background priority scoring on sync
- **Enhanced UI**: Split-panel AI summary layout
- **Improved HTML Stripping**: Clean email display with 7 new regex patterns
- **Advanced Scrolling**: Space/PgDn, PgUp, g/G navigation shortcuts

### Phase 5 Complete

- **Go Bubble Tea TUI**: Beautiful terminal interface
- **HTTP API Integration**: Connects to Node.js backend on port 5178
- **Priority-Based Inbox**: Visual indicators (🔴🟠🟢⚫) for email importance
- **Three-Panel Layout**: Navigation + Inbox + Preview
- **Keyboard Navigation**: Vim-style shortcuts throughout
- **Email Composer**: Full email composition with AI suggestions
- **Quick Reply**: 1/2/3 key instant responses
- **Search**: Full-text search with overlay
- **Batch Operations**: Multi-select for bulk actions

### Core Features

- Beautiful terminal UI with Bubble Tea framework
- Lipgloss styling with Claude orange (#FF6B35) theme
- Real-time status bar with sync status
- Toast notifications for user feedback
- Help overlay with keyboard shortcuts
- Smart bundling (newsletters, OTPs, calendar, etc.)

---

## Pre-Release Development

- Phase 1-4: Initial development (archived)
- Integration testing with backend API
- UI/UX refinements based on user testing

---

**Note**: For detailed development history, see `MASTER_ROADMAP.md` and `docs/archive/`
