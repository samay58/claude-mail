# Claude Mail TUI - Complete Project Description

**Purpose**: This document provides a comprehensive description of the Claude Mail TUI project for discussion with an AI platform about improvements.

**Last Updated**: 2025-12-04

---

## Executive Summary

Claude Mail TUI is a terminal-based email client with AI-native features, designed for power users who prefer keyboard-driven workflows. It's inspired by Gmail Priority Inbox but built for the terminal, combining the speed of TUI interfaces with AI-powered email management.

### Key Value Proposition
- **Keyboard-first**: 40+ keyboard shortcuts, vim-style navigation
- **AI-native**: Summarization, quick replies, draft suggestions via Claude API
- **Smart prioritization**: Four-tier email bucketing (urgent/important/needs-reply/bulk)
- **Terminal aesthetics**: Claude orange theme, responsive layout, Glamour markdown rendering

---

## Architecture Overview

### Hybrid Design (Go Frontend + Node.js Backend)

```
┌─────────────────────────────────────────┐
│       Go TUI (Bubble Tea)               │
│  - Terminal User Interface              │
│  - 11 UI Components                     │
│  - Keyboard navigation                  │
│  - Message-based state management       │
│  - Elm architecture (Model-Update-View) │
└──────────────┬──────────────────────────┘
               │
               │ HTTP REST API
               │ localhost:5178
               │
┌──────────────▼──────────────────────────┐
│      Node.js Agent Backend              │
│  - Express.js HTTP server               │
│  - SQLite database with FTS5            │
│  - IMAP email fetching                  │
│  - SMTP email sending                   │
│  - Claude API for AI features           │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┬────────────┐
       │               │            │
   ┌───▼───┐    ┌──────▼────┐  ┌────▼─────┐
   │SQLite │    │Gmail IMAP │  │Claude API│
   │FTS5   │    │SMTP       │  │(Haiku)   │
   └───────┘    └───────────┘  └──────────┘
```

### Why Hybrid?
**Decision**: Keep existing Node.js backend (6 months of development), add new Go TUI frontend.

**Rationale**:
1. Reuse battle-tested TypeScript code (Database, IMAP, SMTP, AI managers)
2. Go + Bubble Tea provides superior TUI experience
3. Clear separation: backend handles data/AI, frontend handles presentation
4. 10x faster development vs full rewrite

---

## Technology Stack

### Frontend (Go)
- **Framework**: Bubble Tea (Elm-inspired Model-Update-View architecture)
- **Components**: Bubbles (tables, textareas, viewports)
- **Styling**: Lipgloss (terminal CSS-like styling)
- **Markdown**: Glamour (terminal markdown rendering)

### Backend (Node.js)
- **Server**: Express.js
- **Database**: SQLite with better-sqlite3
- **Full-text Search**: FTS5 extension
- **Email**: node-imap (fetch), nodemailer (send)
- **AI**: Anthropic Claude SDK (Claude Haiku)
- **HTML→Markdown**: TurndownService

### Communication
- **Protocol**: REST over HTTP (JSON)
- **Port**: 5178 (localhost only)
- **Auth**: None (local-only design)

---

## Project Structure

```
claude-mail-tui/
├── cmd/claudemail/main.go          # Entry point (32 lines)
├── internal/
│   ├── app/app.go                  # Main orchestrator (~600 lines)
│   ├── data/client.go              # HTTP API client (~380 lines)
│   ├── styles/theme.go             # Claude orange theme (94 lines)
│   ├── types/types.go              # Shared data structures (176 lines)
│   └── ui/
│       ├── inbox/inbox.go          # Email list table (526 lines)
│       ├── preview/preview.go      # Email detail view (605 lines)
│       ├── compose/compose.go      # Email composer (540 lines)
│       ├── nav/nav.go              # Navigation sidebar (377 lines)
│       ├── search/search.go        # Search overlay (401 lines)
│       ├── quickreply/quickreply.go # Quick reply bar (248 lines)
│       ├── batch/batch.go          # Multi-select ops (372 lines)
│       ├── help/help.go            # Help overlay (246 lines)
│       ├── toast/toast.go          # Notifications (187 lines)
│       └── statusbar/statusbar.go  # Status bar (190 lines)
├── docs/                           # Documentation archive
├── go.mod, go.sum                  # Go dependencies
└── MASTER_ROADMAP.md               # Project roadmap
```

**Total Code**: ~6,600 lines Go | ~500 lines TypeScript enhancements

---

## Core Components Deep Dive

### 1. App Orchestrator (`internal/app/app.go`)

Central hub coordinating all 11 UI components:

```go
type Model struct {
    // Components
    client     *data.Client     // HTTP client to backend
    nav        nav.Model        // Left sidebar (10 views)
    inbox      inbox.Model      // Email list table
    preview    preview.Model    // Email detail with markdown
    compose    compose.Model    // Email composer
    quickReply quickreply.Model // Quick reply bar
    search     search.Model     // Search overlay
    help       help.Model       // Help overlay
    toast      toast.Model      // Notifications
    statusBar  statusbar.Model  // Status bar
    batch      batch.Model      // Multi-select

    // State
    width, height int           // Terminal dimensions
    focused string              // "nav", "inbox", "preview"
    view string                 // "list", "detail", "compose"
    showSearch, showHelp bool   // Overlay visibility
}
```

**Responsibilities**:
- Terminal resize handling → recalculates pane widths
- Responsive layout → hides nav when <100 columns
- Global keyboard shortcuts → routes /, ?, tab, h/l/g/i/p
- Message routing → directs messages to appropriate components
- Focus management → tracks which pane has keyboard focus
- View switching → manages list ↔ detail ↔ compose transitions

**Width Distribution**:
- Wide (≥100 cols): Nav (20%) + Inbox (35%) + Preview (45%)
- Narrow (<100 cols): Inbox (40%) + Preview (60%) [nav hidden]

### 2. Data Client (`internal/data/client.go`)

HTTP wrapper around Node.js backend:

**API Endpoints**:
```
Fetching:
  GET  /health              - Health check
  GET  /stats               - Email statistics
  GET  /emails              - List emails with pagination
  GET  /emails/:id          - Get single email detail
  GET  /bundles             - Smart bundle counts

Actions:
  POST /compose             - Send new email
  POST /reply               - Send reply/forward
  POST /star                - Toggle star
  POST /read                - Toggle read status
  POST /sync                - Trigger IMAP sync

AI Features:
  POST /ai/quick-replies    - Get 3 quick reply suggestions
  POST /ai/summarize        - Get AI email summary
  POST /ai/draft-suggest    - Get draft suggestions

Bulk Operations:
  POST /emails/mark-read    - Bulk mark read/unread
  POST /emails/star         - Bulk star/unstar
  POST /emails/delete       - Bulk delete
  POST /emails/archive      - Bulk archive
```

### 3. Navigation Sidebar (`internal/ui/nav/nav.go`)

**10 Email Views** with number key shortcuts (1-9, 0):

| Key | View | Icon | Type |
|-----|------|------|------|
| 1 | Inbox | 📥 | Standard |
| 2 | Starred | ⭐ | Standard |
| 3 | Sent | 📤 | Standard |
| 4 | Drafts | 📝 | Standard |
| 5 | All Mail | 📧 | Standard |
| 6 | Urgent | 🔴 | Smart Bundle |
| 7 | Important | 🟠 | Smart Bundle |
| 8 | Needs Reply | 💬 | Smart Bundle |
| 9 | Calendar | 📅 | Smart Bundle |
| 0 | Newsletter | 📰 | Smart Bundle |

**Current State**: Smart bundle counts are **mocked** (lines 356-364):
```go
return types.BundleCountsMsg{
    Counts: map[string]int{
        "urgent":        5,
        "important":     12,
        "needs_reply":   8,
        "calendar":      4,
        "newsletter":    45,
    },
}
```

### 4. Inbox View (`internal/ui/inbox/inbox.go`)

**Email List Table** with columns:
- Priority icon + score (🔴92, 🟠78, 🟢45, ⚫20)
- From (with unread bullet indicator)
- Subject (truncated)
- Date (short format)

**Features**:
- Pagination with lazy loading (50 emails at a time)
- Vim keybindings (j/k for up/down)
- Batch selection mode (x key toggles)
- Multi-select checkboxes ([✓] and [ ])
- Priority color coding

### 5. Preview Pane (`internal/ui/preview/preview.go`)

**Email Detail Viewer**:
- Glamour markdown rendering (converts HTML emails)
- Full headers (From, To, Date, Subject)
- Scrollable viewport (j/k, Space, PgUp/PgDn)
- AI Summary toggle (s key):
  - Summary, key points, action items
  - Sentiment analysis with color coding
  - Loading state with spinner

### 6. Email Composer (`internal/ui/compose/compose.go`)

**Full-Screen Composition**:
- Multi-field form: To, Cc, Bcc, Subject, Body
- Tab navigation between fields
- Modes: Compose, Reply, Reply-All, Forward
- RFC email validation
- AI draft suggestions (Alt+G to cycle)
- Email threading (MessageID, References, ThreadID)
- Quote original body for replies

### 7. Quick Reply Bar (`internal/ui/quickreply/quickreply.go`)

**AI-Powered Quick Responses**:
- 3 contextual reply suggestions from Claude
- Number keys (1/2/3) for instant sending
- Auto-refreshes inbox after send

### 8. Search Overlay (`internal/ui/search/search.go`)

**Advanced Search**:
- Incremental search with 300ms debounce
- Search filters: `from:`, `to:`, `is:unread`, `is:starred`
- Search history with ↑/↓ navigation (20 entries max)
- Tab to switch between input and results
- Results displayed in same table format as inbox

---

## Data Types & Message Passing

### Core Email Structures (`internal/types/types.go`)

```go
// Email list item (used in inbox table)
type EmailRow struct {
    ID               string
    ThreadID         string
    From             string
    FromEmail        string
    Subject          string
    Snippet          string
    Date             string
    DateShort        string
    IsRead           bool
    IsStarred        bool
    Priority         int     // 0-100 numeric score
    PriorityCategory string  // "urgent", "important", "normal", "low"
}

// Full email detail (used in preview pane)
type EmailDetail struct {
    ID               string
    ThreadID         string
    MessageID        string
    From, To         string
    Subject          string
    Date             string
    BodyText         string
    BodyHTML         string
    Markdown         string   // Converted from HTML
    Folder           string
    Labels           []string
    Priority         int
    PriorityCategory string
    PriorityReason   string   // Human-readable explanation
}

// AI Features
type SummarizeResponse struct {
    Summary     string
    KeyPoints   []string
    ActionItems []string
    Sentiment   string
}

type QuickRepliesResponse struct {
    Replies []string  // 3 contextual suggestions
}
```

### Message Types (Elm Architecture)

The app uses Bubble Tea's message-passing pattern:

```go
// Data loading
EmailsLoadedMsg     // Emails fetched from API
EmailLoadedMsg      // Single email detail loaded
StatsLoadedMsg      // Statistics loaded
BundleCountsMsg     // Smart bundle counts loaded

// AI features
QuickRepliesLoadedMsg    // Quick replies generated
SummaryLoadedMsg         // AI summary generated
DraftSuggestionsLoadedMsg // Draft suggestions generated

// Actions
SyncStartedMsg      // Sync began
SyncCompletedMsg    // Sync finished with feedback
EmailSentMsg        // Email sent successfully
ToastMsg            // Notification to display
ErrorMsg            // Error occurred
```

**Flow**: User Input → Update() → Commands → Async Operations → Messages → Update() → View()

---

## Styling & Theme (`internal/styles/theme.go`)

### Color Palette (Claude Orange Theme)

```go
// Core colors
Primary    = "#FF6B35"  // Claude Orange
Surface    = "#2D2D2D"  // Dark background
Text       = "#FFFFFF"  // White text
TextMuted  = "#808080"  // Gray text

// Priority colors
PriorityUrgent    = "#FF0000"  // Red 🔴
PriorityImportant = "#FF6B35"  // Orange 🟠
PriorityNormal    = "#4CAF50"  // Green 🟢
PriorityLow       = "#808080"  // Gray ⚫
```

### Priority Display Logic

```go
func PriorityIcon(category string) string {
    switch category {
    case "urgent":    return "🔴"
    case "important": return "🟠"
    case "normal":    return "🟢"
    case "low":       return "⚫"
    default:          return "⚪"
    }
}
```

**Display Format in Inbox**:
```
🔴92  alice@company.com   Action Required: Q1 Budget    Jan 27
🟠78  bob@partner.com     Meeting Follow-up             Jan 26
🟢45  newsletter@tech.com Weekly Digest                 Jan 25
⚫20  promo@shop.com      50% Off Sale!                 Jan 24
```

---

## Current Prioritization System

### What's Currently Implemented

**Basic Priority Fields** in database:
- `priority` (int 0-100): Numeric score
- `priorityCategory` (string): One of {"urgent", "important", "normal", "low"}
- `priorityReason` (string): Human-readable explanation

**Smart Bundles** (4 priority buckets + 1 calendar):
| Bundle | Score Range | Purpose |
|--------|-------------|---------|
| 🔴 Urgent | ≥85 | Requires immediate attention |
| 🟠 Important | 70-84 | Needs response soon |
| 💬 Needs Reply | 60-69 | Predicted to need response |
| 📰 Newsletter | <60 | Low-priority mass mail |
| 📅 Calendar | N/A | Calendar-related emails |

**Current Limitation**: Bundle counts are **mocked**. The backend doesn't yet compute real priority scores.

### Planned Phase 7: Intelligent Prioritization

A comprehensive 4-week implementation plan exists for Gmail Priority Inbox-style learning:

#### Phase 7.1: Schema & Deterministic Gates (Week 1)
RFC-compliant email classification:

| Gate | Detection Method | Action |
|------|-----------------|--------|
| Newsletter | RFC 2369 (List-Unsubscribe), RFC 2919 (List-ID) | -40 penalty |
| Auto-Generated | RFC 3834 (Auto-Submitted header) | -30 penalty |
| Calendar | RFC 5545 (text/calendar MIME) | +20 if <2hrs |
| OTP | RFC 6238 + "code" patterns | -50 if expired |

New database tables:
- `message_features` - Extracted features for scoring
- `sender_relationships` - Interaction history per sender
- `user_feedback` - User corrections for learning

#### Phase 7.2: Relationship Scoring (Week 2)
Sender interaction history:

```
Relationship Score (0.0-1.0) =
  replyRatio * 0.3        // How often user replies
  + exchangeRatio * 0.3   // Two-way conversations
  + recencyBoost * 0.2    // Recent interaction
  + volumeBoost * 0.2     // Frequent communication
```

**Thread "You Owe" Signal**: Last message from sender = user should reply

#### Phase 7.3: Scoring Function (Week 3)

```
Priority Score (0-100):

Base score: 50

PENALTIES:
  - Newsletter detected:     -40
  - Auto-generated:          -30
  - Expired OTP:             -50

RELATIONSHIP SIGNALS (+30 max):
  - VIP sender:              +30
  - relationship_score:      +20 * score

THREAD CONTEXT (+20 max):
  - You owe reply:           +15
  - Recent thread:           +10 * decay(minutes)

CONTENT SIGNALS (+30 max):
  - Explicit ask/question:   +20
  - Deadline within 4hrs:    +25
  - Calendar within 2hrs:    +20

REPLY PREDICTION (+15 max):
  - P(user will reply):      +15 * probability

BUCKET ASSIGNMENT:
  score ≥ 85 → 🔴 Urgent
  score ≥ 70 → 🟠 Important
  score ≥ 60 → 💬 Needs Reply
  score < 60 → 📰 Bulk
```

#### Phase 7.4: Feedback Loop (Week 4)
Passive-Aggressive Online Learning:
- Track user actions (star, archive, mark urgent)
- Detect systematic errors (over/under predictions)
- Adapt scoring weights based on feedback
- Per-user threshold tuning

---

## Current Features (Implemented)

### Phase 0-5.5 Complete (100%)

| Feature | Status |
|---------|--------|
| Multi-pane responsive layout | ✅ |
| 10 email views | ✅ |
| AI summarization toggle | ✅ |
| Quick replies (3 options) | ✅ |
| Email composer with draft suggestions | ✅ |
| Batch operations (select, mark, star, delete) | ✅ |
| Full-text search with filters | ✅ |
| Help system (40+ shortcuts) | ✅ |
| Toast notifications | ✅ |
| Status bar with sync status | ✅ |
| Email threading (reply/forward) | ✅ |

### Phase 6-7 Planned (0%)

| Feature | Priority |
|---------|----------|
| Performance optimization | Medium |
| Unit tests with teatest | Medium |
| Intelligent prioritization | High |
| Relationship tracking | High |
| Feedback-based learning | High |

---

## Keyboard Shortcuts

### Global
| Key | Action |
|-----|--------|
| ? | Toggle help |
| / | Open search |
| Tab | Cycle focus |
| 1-9,0 | Select view |
| q | Quit |
| Ctrl+C | Quit |

### Navigation
| Key | Action |
|-----|--------|
| h/l | Move focus left/right |
| j/k | Navigate up/down |
| Enter | Open email |
| Esc | Go back |
| g | Go to top |
| G | Go to bottom |

### Email Actions
| Key | Action |
|-----|--------|
| c | Compose new |
| r | Reply |
| a | Reply all |
| f | Forward |
| t | Toggle star |
| s (inbox) | Sync |
| s (preview) | Toggle summary |

### Batch Operations
| Key | Action |
|-----|--------|
| x | Toggle select mode |
| Space | Toggle selection |
| a | Select all |
| n | Select none |
| i | Invert selection |
| r | Mark as read |
| u | Mark as unread |
| d | Delete |
| e | Archive |

### Composer
| Key | Action |
|-----|--------|
| Tab | Next field |
| Shift+Tab | Previous field |
| Alt+G | Cycle AI suggestions |
| Ctrl+S | Send |
| Esc | Cancel |

---

## Performance Characteristics

| Metric | Current |
|--------|---------|
| Startup time | <100ms |
| Email list render | <10ms for 100 emails |
| AI response time | 1-2s (API dependent) |
| Memory usage | ~30MB typical |
| Binary size | 21MB |
| API latency | <50ms (localhost) |

**Scalability**:
- Lazy loading with pagination (50 emails/batch)
- Debounced search (300ms)
- Toast queue max 3 items
- Search history max 20 entries
- HTTP client timeout: 30 seconds

---

## Key Design Decisions

### 1. Hybrid Architecture
**Choice**: Keep Node.js backend, add Go frontend
**Alternative**: Full Go rewrite
**Rationale**: 10x faster development, reuse 6 months of code

### 2. Bubble Tea (Elm Architecture)
**Choice**: Message-passing, immutable state updates
**Alternative**: Imperative state management
**Rationale**: Predictable state, easier debugging, cleaner async handling

### 3. Four Priority Buckets
**Choice**: Urgent, Important, Needs Reply, Bulk
**Alternative**: Gmail's 5+ categories (Primary, Promotions, Social, etc.)
**Rationale**: Simpler for power users, less cognitive load

### 4. RFC-Compliant Detection
**Choice**: Use email headers for classification (List-Unsubscribe, Auto-Submitted)
**Alternative**: Content-based ML classification
**Rationale**: Deterministic, zero false positives, no training data needed

### 5. Local-Only Design
**Choice**: No authentication, localhost-only API
**Alternative**: Cloud service with auth
**Rationale**: Privacy-first, no data leaves machine, simpler deployment

---

## Known Limitations & Gaps

### Critical Gaps
1. **Priority scores are not computed** - Backend returns placeholder values
2. **Bundle counts are mocked** - Frontend uses hardcoded numbers
3. **No relationship tracking** - sender_relationships table doesn't exist yet
4. **No feedback loop** - User actions don't influence future prioritization

### Technical Debt
1. **No unit tests** - Need teatest coverage for UI components
2. **No integration tests** - API endpoints untested
3. **Hardcoded thresholds** - Priority buckets not configurable
4. **No caching** - AI calls made fresh each time (prompt caching planned)

### UX Gaps
1. **Mouse support limited** - Scrolling works, clicking doesn't
2. **No email threading view** - Shows individual emails, not conversations
3. **No attachment handling** - Can't view/download attachments
4. **No offline mode** - Requires backend connection

---

## Potential Improvement Areas

### Priority System
1. Implement Phase 7 scoring algorithm
2. Add RFC-compliant detection gates
3. Build sender relationship tracking
4. Implement feedback-based weight adaptation
5. Add user-configurable priority thresholds

### AI Features
1. Add prompt caching for repeated summarization
2. Implement content intent extraction with Claude
3. Add deadline/calendar extraction from email body
4. Smart folder suggestions based on content

### UX Enhancements
1. Full mouse support (click to select, drag to batch select)
2. Conversation threading view (group by ThreadID)
3. Attachment preview/download
4. Email snooze functionality
5. Undo for destructive actions
6. Custom view filters (save search as view)

### Performance
1. Background prefetching of email previews
2. Intelligent pagination (load more on scroll)
3. Cache AI responses (summary, quick replies)
4. Compress API payloads

### Testing
1. Unit tests for all UI components
2. Integration tests for API endpoints
3. Synthetic email fixtures for priority testing
4. Gold set of real emails for accuracy validation

---

## Conclusion

Claude Mail TUI is a well-architected terminal email client at 75% completion. The core TUI functionality is solid, with responsive layout, comprehensive keyboard shortcuts, and AI features. The main gap is the intelligent prioritization system (Phase 7), which exists only as a detailed spec document.

The hybrid architecture (Go TUI + Node.js backend) was a pragmatic choice that enabled rapid development while maintaining flexibility for future enhancements. The Elm-inspired message-passing pattern has proven effective for managing complex async state.

Key opportunities for improvement:
1. **Implement Phase 7** - This would transform the app from "email viewer with AI" to "intelligent email assistant"
2. **Add feedback loop** - Learning from user behavior is the key differentiator from basic clients
3. **Performance optimization** - Caching, prefetching, and lazy loading for larger mailboxes
4. **Testing coverage** - Critical for reliability as complexity grows

The codebase is well-organized, documented, and ready for continued development.
