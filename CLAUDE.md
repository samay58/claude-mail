# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 **PRIMARY INTERFACE: Go Bubble Tea TUI**

**IMPORTANT**: The main user-facing application is the **Go Bubble Tea TUI** (`claude-mail-tui/`), NOT the Node.js server. The architecture is:

```
┌──────────────────────────────────┐
│  Go Bubble Tea TUI (FRONTEND)    │  ← THIS IS THE PRIMARY INTERFACE
│  Location: ../claude-mail-tui/   │  ← Users interact with THIS
│  Port: Terminal UI (no network)  │  ← Beautiful priority-scored inbox
└────────────┬─────────────────────┘
             │ HTTP API calls
             │ localhost:5178
┌────────────▼─────────────────────┐
│  Node.js API Server (BACKEND)    │  ← This is the BACKEND API
│  Location: /email-agent/         │  ← RFC-based scoring engine
│  Port: 5178                       │  ← Database, IMAP, SMTP, AI
└──────────────────────────────────┘
```

**When working on this project**:
1. ✅ **Test with the TUI FIRST** - Run `./claudemail` in the Go TUI directory
2. ✅ **UI changes go in Go code** - `../claude-mail-tui/internal/ui/`
3. ✅ **Backend/scoring changes go in Node.js** - `/email-agent/src/`
4. ❌ **Don't confuse the two** - TUI shows priority scores FROM the API

---

## 🏗️ Architecture Deep Dive

### Core Data Flow Pipeline
```
[Email Server] → [IMAP] → [Parser] → [Database] → [AI Analysis] → [UI State] → [Components]
      ↓             ↓         ↓          ↓           ↓             ↓           ↓
   Gmail/etc    imap.ts   mailparser   SQLite    AIManager    useEmailState  React-Ink
                                         ↓           ↓             ↓
                                     FTS5 Search  Priorities   View Logic
                                        ↓           ↓             ↓
                                   Full-text     ai_cache     UI Updates
```

### State Management Architecture
**Central Orchestration**: `useEmailState` (180 lines) is the single source of truth
```typescript
// State flow through the application:
useEmailState() {
  emails: EmailRecord[]                    // Raw email data from database
  ↓
  emailPriorities: Map<string, Priority>   // AI scores mapped by email.id
  ↓
  filteredEmails (memoized)               // Search + priority sorted view
  ↓
  selectedEmail = filteredEmails[selectedIndex]  // Currently highlighted email
} → tui.tsx props → Component rendering
```

**State Synchronization Points**:
- Database changes → `refreshEmails()` → React re-render
- AI analysis → `emailPriorities` Map update → Badge re-render
- User input → View state change → Component switching

### Component Dependency Tree
```
tui.tsx (Main App - 275 lines)
├── useEmailState() ────────────────── Centralized state management
├── useKeyboardShortcuts() ─────────── Input handling delegation
├── Header() ───────────────────────── Stats display, connection status
├── SearchInput() ──────────────────── Search overlay (conditional)
│
├── TableEmailList ─────────────────── Main email display (list view)
│   ├── TableEmailRow ──────────────── Individual 51-char fixed rows
│   │   └── FixedEmailBadges ──────── Priority + tag system
│   └── Priority summary footer
│
├── EmailDetailView ────────────────── Full email viewer (detail view)
│   ├── Email header/body rendering
│   ├── QuickReplyBar ──────────────── 1/2/3 instant replies
│   └── Action buttons (reply/forward)
│
└── EmailComposer ──────────────────── Email editor (compose view)
    ├── Field navigation (To/Subject/Body)
    ├── AI suggestion integration
    └── Send/save functionality

Singleton Services (Global instances):
├── DatabaseManager.getInstance() ──── SQLite operations, email storage
├── AIManager.getInstance() ────────── Claude API, heuristic prioritization
└── SMTPManager.getInstance() ───────── Email sending via nodemailer
```

## 📁 File-by-File Deep Analysis

### Core Application Layer (src/)

#### `tui.tsx` (275 lines) - **Main Application Orchestrator**
**Role**: React-Ink root, view routing, event coordination
**Architecture**:
```typescript
App() {
  const emailState = useEmailState();           // All app state
  useKeyboardShortcuts({ ...emailState });     // Input delegation

  // View routing logic:
  if (view === 'detail') return <EmailDetailView/>
  if (view === 'compose') return <EmailComposer/>
  return <TableEmailList/>                     // Default list view
}
```
**Key Functions**:
- `handleSendEmail()` - SMTP sending coordination
- `handleToggleStar()` - Database state updates
- `Header()` - Connection status + priority counts
- `SearchInput()` - Search mode overlay
**Critical Dependencies**: ALL hooks, ALL components, ALL managers

#### `database.ts` (283 lines) - **Data Persistence Layer**
**Role**: SQLite operations, schema management, full-text search
**Schema Design**:
```sql
-- Core email storage (24 columns)
emails: id(PK), thread_id, message_id(UNIQUE), subject, sender_email,
        sender_name, recipient_emails(JSON), date(ISO), body_text, body_html,
        snippet, is_read(BOOL→INT), is_starred(BOOL→INT), is_important(BOOL→INT),
        folder, labels(JSON), created_at, updated_at

-- AI performance cache (9 columns)
ai_cache: email_id(PK→emails.id), priority_score(0-100), priority_category,
          priority_reason, suggested_action, quick_replies(JSON),
          draft_suggestions(JSON), sender_profile(JSON), created_at, updated_at

-- Full-text search virtual table
emails_fts: subject, sender_name, sender_email, body_text, snippet
           (FTS5 with content='emails', content_rowid='rowid')

-- Auto-extracted contacts (7 columns)
contacts: email(PK), name, domain, first_seen, last_seen, email_count
```
**Performance Strategy**:
- WAL mode for concurrent access
- Strategic indexes on date(DESC), sender, read status, thread_id
- FTS5 for semantic search with fallback to LIKE queries
**Critical Methods**:
- `getEmailsWithPriority()` - Main query with LEFT JOIN to ai_cache
- `upsertEmail()` - Deduplication via INSERT OR REPLACE
- `markAsStarred()` - Boolean→Integer conversion for SQLite compatibility

#### `imap.ts` (182 lines) - **Email Fetching Layer**
**Role**: IMAP connection, message parsing, incremental sync
**Architecture**:
```typescript
ImapManager → node-imap → mailparser → EmailRecord → database.ts
```
**Key Operations**:
- `connect()` - TLS connection with Gmail IMAP
- `fetchEmails()` - Parse raw messages to EmailRecord objects
- `syncIncrementalEmails()` - UID-based delta sync
**Dependencies**: node-imap (connection), mailparser (message parsing), database.ts (storage)

### State Management Layer (src/hooks/)

#### `useEmailState.ts` (180 lines) - **Central State Hub**
**Role**: All application state, email operations, AI coordination
**State Variables** (12 total):
```typescript
// Core data
emails: EmailRecord[]                     // Raw email array from database
emailPriorities: Map<string, {score, category}>  // AI analysis cache in memory
selectedIndex: number                     // Current table selection (0-based)

// UI state
view: 'list'|'search'|'detail'|'compose'  // Current application view
searchQuery: string                       // Filter text for email list
composeMode: 'compose'|'reply'|'replyAll'|'forward'  // Composer context

// AI integration
aiSuggestions: string[]                   // Generated draft bodies
quickReplies: string[]                    // 1/2/3 quick response options

// Display preferences
sortByPriority: boolean                   // Priority-first vs chronological
stats: {emails, unread, contacts}         // Header display data
connectionStatus: 'connecting'|'connected'|'error'  // IMAP status
```

**Memoized Computations**:
```typescript
filteredEmails = useMemo(() => {
  1. Apply search filter (if searchQuery)
  2. Apply priority sort (if sortByPriority)
  3. Return processed array
}, [emails, searchQuery, emailPriorities, sortByPriority])

priorityCounts = useMemo(() => {
  // Count urgent(90+), important(70-89), normal(<70)
}, [emails, emailPriorities])
```

**Critical Effects**:
- Initial load: `db.getEmailsWithPriority()` → AI background prioritization
- Compose mode: Auto-generate AI suggestions when replying

#### `useKeyboardShortcuts.ts` (151 lines) - **Input Event Router**
**Role**: Keyboard event handling, view-specific routing
**Event Flow**:
```typescript
Terminal Input → useInput() → View-specific logic → State updates → Re-render
```
**Key Mappings**:
```typescript
Navigation: 'j'/'k'(↑/↓), 'g'/'G'(top/bottom), Space/PgDn(page), Enter(open)
Actions: 'c'(compose), 'r'(reply), 'R'(reply-all), 'f'(forward)
Organization: 't'(star), 'm'(read), 'p'(priority-sort)
System: '/'(search), 's'(sync), 'q'(quit)
```
**Architecture**: Receives all state from useEmailState, returns action callbacks

### Business Logic Layer (src/core/)

#### `AIManager.ts` (533 lines) - **Claude Integration & Heuristics Engine**
**Role**: AI-powered email analysis, dual-mode operation
**Dual Architecture**:
```typescript
AI Mode (with ANTHROPIC_API_KEY):
  prioritizeEmail() → Claude Haiku API → JSON response → cache in database

Heuristic Mode (fallback):
  heuristicPrioritize() → keyword analysis → rule-based scoring → same output format
```

**Priority Scoring Algorithm**:
```typescript
Base Score: 50
Adjustments:
  +30: Urgent keywords (urgent, asap, deadline, critical)
  +20: Personal pronouns (you, your, we, us)
  +15: Questions (?, "can you", "would you")
  +10: Important domains (.edu, .gov, company domains)
  +10: Time-sensitive (today, tomorrow, this week)
  -20: Marketing keywords (unsubscribe, promotional, deal)
  -10: No-reply senders

Categories: urgent(90+), important(70-89), normal(50-69), low(30-49), spam(<30)
```

**Core Methods**:
- `prioritizeEmail()` - Main entry point, routes to AI or heuristic
- `generateDraftSuggestions()` - Multi-tone response generation
- `isConfigured()` - Check if API key available
**Caching Strategy**: All results stored in ai_cache table to avoid re-analysis

#### `SMTPManager.ts` (226 lines) - **Email Sending Layer**
**Role**: SMTP operations, email threading, authentication
**Email Types**:
```typescript
New Email: sendEmail({to, subject, text}) → nodemailer → SMTP
Reply: sendReply(messageId, to, subject, body, references) → threading headers
```
**Threading Support**: Proper In-Reply-To and References headers for email clients
**Configuration**: Environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)

### User Interface Layer (src/components/)

#### `TableEmailList.tsx` (141 lines) - **Main Email Table**
**Role**: Fixed-width email list rendering, zero layout jumping
**Table Structure**:
```
┌─ Header: "📥 Inbox (42 emails)" ─────────────────────────┐
├─ Column Headers: "Sel Pri  Sender   Subject..." ────────┤
├─ Separator: "───┼────┼────────┼─────────────────..." ───┤
├─ TableEmailRow components (mapped from emails array) ────┤
└─ Footer: "3 of 42 selected • 2 urgent • 5 important" ──┘
```
**Architecture**: Maps emails array → TableEmailRow components → 51-char rows

#### `TableEmailRow.tsx` (121 lines) - **Individual Email Row**
**Role**: Single email rendering with mathematical precision
**Character Mathematics**:
```
Total Width: 51 characters (guaranteed)
Layout: " ▶ " + "🔴85 " + "JohnDoe " + "Meeting Request...   " + " 2h " + "ACT " + "★ "
Breakdown: 3 + 5 + 8 + 25 + 4 + 4 + 2 = 51 chars
```
**Helper Functions**:
```typescript
padRight(text, length) → Ensure exact column width with space padding
truncate(text, length) → Smart truncation with "..." for overflow
formatDate(date) → Relative time ("2h", "3d", "Sep 15")
```
**Color Coding**: Selected (orange), unread (white), read (gray), priority colors

#### `FixedEmailBadges.tsx` (114 lines) - **Priority & Content Analysis**
**Role**: Consistent badge rendering, content tagging
**Fixed Formats**:
```typescript
Priority Badge: "🔴85" (4 chars) - emoji + 2-digit score
Tag Codes: "ACT" (3 chars) - standardized abbreviations
```
**Tag Detection Engine**:
```typescript
Content Analysis → Keywords → Single Tag:
- meeting/calendar → MTG
- ?/question → QUE
- invoice/payment → INV
- security alert → SEC
- priority + action → ACT
- fyi/information → FYI
```

#### `EmailDetailView.tsx` (226 lines) - **Full Email Viewer**
**Role**: Complete email display, scrolling, quick actions
**Layout**: Header + Body + QuickReplyBar + Action buttons
**Integration**: Uses `generateQuickReplies()` from useEmailState

#### `EmailComposer.tsx` (242 lines) - **Email Editor**
**Role**: Email composition, AI integration, field navigation
**Features**: Tab navigation, AI suggestion cycling, word count, validation
**Integration**: Receives `aiSuggestions` from useEmailState hook

#### `QuickReplyBar.tsx` (95 lines) - **Instant Actions**
**Role**: 1/2/3 key quick response system
**Integration**: Embedded in EmailDetailView, triggers SMTP operations

## 🗄️ Database Schema & Performance

### Core Table Relationships
```sql
emails (Primary data)
├── id (PK) ────┐
├── message_id  │
├── thread_id   │
├── sender_*    │
├── subject     │
├── body_*      │
├── is_read     │
├── is_starred  │
└── timestamps  │
                │
ai_cache        │
├── email_id ───┘ (FK to emails.id)
├── priority_score (0-100)
├── priority_category (urgent/important/normal/low/spam)
├── quick_replies (JSON array)
├── draft_suggestions (JSON array)
└── timestamps

emails_fts (Virtual FTS5 table)
├── Links to emails via rowid
├── Searchable: subject + sender_name + sender_email + body_text + snippet
└── Automatic tokenization, ranking, stemming
```

### Query Performance Strategy
**Main Query**: `getEmailsWithPriority()` uses LEFT JOIN for AI-enhanced display
```sql
SELECT e.*, COALESCE(a.priority_score, 50) as priority_score
FROM emails e LEFT JOIN ai_cache a ON e.id = a.email_id
ORDER BY COALESCE(a.priority_score, 50) DESC, e.date DESC
```

**Search Strategy**: FTS5 first, LIKE fallback
```sql
-- Primary: FTS5 semantic search
SELECT e.* FROM emails e JOIN emails_fts fts ON e.rowid = fts.rowid
WHERE emails_fts MATCH ? ORDER BY e.date DESC

-- Fallback: LIKE search
SELECT * FROM emails WHERE subject LIKE ? OR body_text LIKE ?
```

**Indexes for Performance**:
- `idx_emails_date` - Timeline sorting (DESC for recent-first)
- `idx_emails_sender` - Sender filtering and grouping
- `idx_emails_read` - Unread counting
- `idx_emails_thread_id` - Email threading

## 🎨 Fixed-Width Layout Mathematics

### Character Count System
**Problem Solved**: Variable content lengths caused terminal UI jumping
**Solution**: Mathematical precision for every UI element

**Row Width Calculation**:
```
Total: 51 characters (immutable)
┌─────┬─────┬─────────┬─────────────────────────┬─────┬─────┬────┐
│ Sel │ Pri │ Sender  │ Subject                 │Time │Tags │Star│
│  3  │  5  │    8    │           25           │  4  │  4  │ 2  │
└─────┴─────┴─────────┴─────────────────────────┴─────┴─────┴────┘
```

**Padding Implementation**:
```typescript
const padRight = (text: string, length: number): string => {
  return text.length >= length
    ? text.substring(0, length)           // Truncate if too long
    : text + ' '.repeat(length - text.length);  // Pad if too short
};

// Usage example:
const senderCol = padRight(truncate(senderName, 8), 8);  // Always 8 chars
```

**Tag Standardization**:
```typescript
// 6 standardized 3-letter codes (prevents variable width)
ACTION → ACT    (requires response)
MEETING → MTG   (calendar/scheduling)
QUESTION → QUE  (contains questions)
INVOICE → INV   (payment/billing)
SECURITY → SEC  (security alerts)
FYI → FYI      (informational only)
```

### Color & Visual Hierarchy
```typescript
// Priority colors (consistent across components)
urgent: '#FF0000'     (red circle 🔴)
important: '#FF6B35'  (orange circle 🟠)
normal: '#4CAF50'     (green circle 🟢)
low: '#808080'        (gray circle ⚫)
spam: '#404040'       (dark gray 🗑️)

// Theme consistency
primary: '#FF6B35'    (Claude orange throughout)
text: '#FFFFFF'       (unread emails)
textSecondary: '#B8B8B8'  (read emails)
textMuted: '#808080'  (metadata like dates)
```

## 🔍 Development Navigation & Debugging

### Common Issue Decision Trees

#### **"Emails not loading"**
```
Check: useEmailState.ts:26-35 → Database connection
  ├─ If database error → database.ts:30-40 → Schema initialization
  ├─ If env error → .env file → IMAP credentials
  └─ If IMAP error → imap.ts:connect() → TLS/authentication

Root cause 90%: Wrong IMAP credentials or database permissions
```

#### **"UI jumping/layout issues"**
```
Check: TableEmailRow.tsx:45-65 → Column width calculations
  ├─ Are all columns using padRight()? → Verify exact character counts
  ├─ Any dynamic content? → FixedEmailBadges.tsx:50-80 → Tag consistency
  └─ Row width math correct? → Total should be exactly 51 characters

Root cause 90%: Variable content length breaking fixed-width design
```

#### **"AI features not working"**
```
Check: AIManager.ts:39-50 → API key configuration
  ├─ If no API key → Heuristic mode should work
  ├─ If API errors → Check rate limits, key validity
  └─ If no priorities → useEmailState.ts:53-70 → Background AI loop

Root cause 90%: Missing ANTHROPIC_API_KEY or API rate limiting
```

#### **"Keyboard shortcuts not responding"**
```
Check: useKeyboardShortcuts.ts:31-50 → Event handling
  ├─ Is view correct? → useEmailState.ts:11 → View state logic
  ├─ Component conflicts? → tui.tsx:143-157 → Hook integration
  └─ Input focus issues? → React-Ink input handling in components

Root cause 90%: Wrong view state or component input interference
```

### Feature Addition Roadmap

#### **Adding New Component**
```typescript
1. Create src/components/NewComponent.tsx
   - Follow fixed-width design if table-related
   - Import theme from existing components
   - Add TypeScript interface for props

2. Update src/tui.tsx
   - Add import statement
   - Add to appropriate view condition
   - Pass required props from emailState

3. Update useEmailState.ts (if new state needed)
   - Add useState hook
   - Add to return object
   - Add any useEffect for initialization
```

#### **Adding New Database Operation**
```typescript
1. Add method to DatabaseManager class (src/database.ts)
   - Use prepared statements for performance
   - Convert booleans to integers (starred ? 1 : 0)
   - Add appropriate error handling

2. Add index if querying frequently
   CREATE INDEX IF NOT EXISTS idx_new_column ON emails(new_column)

3. Update TypeScript interfaces
   - EmailRecord interface for data structure
   - Component props for new data flow
```

#### **Adding New AI Feature**
```typescript
1. Add method to AIManager class (src/core/AIManager.ts)
   - Follow dual-mode pattern (AI + heuristic fallback)
   - Cache results in ai_cache table
   - Return consistent interface

2. Update useEmailState.ts
   - Add state variable for AI results
   - Add useEffect for background processing
   - Add to component props

3. Update relevant components
   - Receive new AI data via props
   - Render with fixed-width constraints
```

## 🛠️ Development Environment

### Essential Commands
```bash
# Development cycle
npm start                  # Launch TUI (via tsx - no compilation needed)
npm run build             # TypeScript compilation to dist/
npx tsc --noEmit         # Type checking only (faster feedback)

# Environment management
cp .env.example .env     # Copy configuration template
# Edit .env: Add Gmail app password + Anthropic API key

# Database management
# Database auto-creates at ./data/emails.db (SQLite)
# No manual setup required, schema auto-initialized
```

### Environment Variables Deep Dive
```bash
# Email Access (Required for core functionality)
AUTH_METHOD=imap                          # Only IMAP supported currently
IMAP_HOST=imap.gmail.com                 # Gmail IMAP server
IMAP_PORT=993                            # TLS port
IMAP_TLS=true                            # Encrypted connection
IMAP_USER=your-email@gmail.com           # Gmail address
IMAP_PASSWORD=abcd-efgh-ijkl-mnop        # 16-char app password (not account password!)

# AI Features (Optional - heuristic fallback available)
ANTHROPIC_API_KEY=sk-ant-api03-...       # Claude API access

# Email Sending (Optional - uses same credentials as IMAP)
SMTP_HOST=smtp.gmail.com                 # Gmail SMTP (auto-detected)
SMTP_PORT=587                            # TLS submission port
SMTP_USER=                               # Uses IMAP_USER if not set
SMTP_PASSWORD=                           # Uses IMAP_PASSWORD if not set
```

### TypeScript Configuration
```json
{
  "target": "ES2020",           // Modern JS features
  "module": "NodeNext",         // ES modules + Node.js compatibility
  "moduleResolution": "NodeNext", // Proper .js imports from .ts files
  "jsx": "react",               // React components for Ink
  "strict": true,               // Full type checking
  "outDir": "./dist",           // Compiled output
  "rootDir": "./src"            // Source input
}
```

## 🎯 Critical Patterns & Anti-Patterns

### SQLite Type Safety (Critical)
```typescript
// ✅ CORRECT: SQLite requires integers for booleans
stmt.run(starred ? 1 : 0, id);
stmt.run(isRead ? 1 : 0, id);

// ❌ WRONG: Will throw TypeError
stmt.run(starred, id);        // TypeError: SQLite3 can only bind numbers, strings...
```

### Singleton Pattern (Architecture)
```typescript
// ✅ CORRECT: Always use getInstance()
const db = DatabaseManager.getInstance();
const ai = AIManager.getInstance();
const smtp = SMTPManager.getInstance();

// ❌ WRONG: Creates multiple instances, breaks caching
const db = new DatabaseManager();
```

### Fixed-Width Component Design (UI Stability)
```typescript
// ✅ CORRECT: Exact character count planning
const selectionCol = isSelected ? ' ▶ ' : '   ';        // Always 3 chars
const priorityCol = padRight(priority, 5);              // Always 5 chars
const totalWidth = 3 + 5 + 8 + 25 + 4 + 4 + 2;        // Always 51 chars

// ❌ WRONG: Variable content causes layout jumping
const priorityCol = `${icon}${score} [${tag}]`;        // Variable length!
```

### React-Ink Terminal UI
```typescript
// ✅ CORRECT: Use Ink components for terminal
<Box flexDirection="column" borderStyle="single">
  <Text color="#FF6B35" bold>Header</Text>
</Box>

// ❌ WRONG: HTML won't render in terminal
<div className="container">
  <h1 style={{color: 'red'}}>Header</h1>
</div>
```

### State Updates & Re-rendering
```typescript
// ✅ CORRECT: Update state, components re-render automatically
db.markAsStarred(id, true);
emailState.refreshEmails();               // Triggers re-render

// ❌ WRONG: Direct DOM manipulation won't work
document.getElementById('email-row').classList.add('starred');
```

## 📚 Recent Major Changes (2024-09-24)

### Architectural Transformation Summary
**Before**: 949-line monolithic tui.tsx with UI jumping issues
**After**: 275-line orchestrator with fixed table layout, zero UI jumping

**Critical Changes**:
1. **SQLite Bug Fix**: `markAsStarred()` boolean→integer conversion
2. **Component Extraction**: useEmailState + useKeyboardShortcuts hooks
3. **Fixed Layout System**: TableEmailList/Row/Badges with character precision
4. **Repository Cleanup**: Removed unused directories, consolidated components

**Performance Impact**:
- 71% reduction in main file complexity
- 100% elimination of UI layout jumping
- Zero TypeScript compilation errors
- Improved maintainability with clear separation of concerns

### Key Learning: Terminal UI Design Principles
1. **Fixed-width design prevents layout thrashing**
2. **Character-count precision essential for React-Ink**
3. **Component consolidation > feature expansion**
4. **Memoization critical for performance in terminal UIs**

**Reference**: See `DEVELOPMENT_PROGRESS_LOG.md` for complete session details.

## 🚀 Interface & Type Flow

### EmailRecord Data Flow
```typescript
IMAP → mailparser → EmailRecord interface → database.ts storage
                           ↓
database.ts → useEmailState.emails[] → Component props
                           ↓
AI Analysis → emailPriorities Map → Badge rendering
```

### Key TypeScript Interfaces
```typescript
EmailRecord (24 fields) - Core email data structure from database
├── id, thread_id, message_id (identifiers)
├── subject, sender_email, sender_name (display data)
├── body_text, body_html, snippet (content)
├── is_read, is_starred, is_important (status flags)
└── dates, folder, labels (metadata)

EmailPriority - AI analysis output
├── score: number (0-100)
├── category: 'urgent'|'important'|'normal'|'low'|'spam'
├── reason: string (explanation)
└── suggestedAction?: string (optional action)

View Types - UI state management
├── 'list' (default table view)
├── 'search' (filtered table with search input)
├── 'detail' (full email viewer)
└── 'compose' (email editor)
```

### Error Handling Strategy
**Database Layer**: Try/catch with fallback queries, graceful degradation
**AI Layer**: Heuristic fallback when API unavailable, cached results
**UI Layer**: Error boundaries, loading states, user feedback
**Network Layer**: Connection status tracking, retry logic

This codebase implements a **production-ready terminal email client** with **AI-enhanced email management**, **zero-jumping UI design**, and **clean architectural patterns** optimized for maintainability and user experience.