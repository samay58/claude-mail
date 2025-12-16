# Changelog

All notable changes to the Claude Email Agent backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - 2025-12-04 (Phase 5.6: Transactional Email Detection)

- **Transactional Email Detection**: Fixed scores for shipping, receipts, and security emails
  - New method: `RFCGates.detectTransactional()` with sender/subject pattern matching
  - New type: `TransactionalType = 'shipping' | 'receipt' | 'security' | 'verification' | null`
  - Phase 0.5 in PriorityScorer: processes transactional emails before regular scoring

- **User-Preference Based Scoring**:
  - Shipping/order notifications → 55/normal (visible but not prioritized)
  - Receipts/invoices → 35/low (buried, just record-keeping)
  - Security alerts → 55/normal (routine, too many to be urgent)

- **Sync Limit Increase**: Default sync limit raised from 150 to 2000 emails
  - Covers ~3-6 months of email history
  - IMAP timeouts increased from 10s to 60s for large syncs
  - Console spam reduced to log every 100 emails instead of each email

### Changed - 2025-12-04

- **Score Distribution Improvement**:
  - Before: 3 urgent, 55 important, 1 normal, 138 spam
  - After: 4 urgent, 59 important, 18 normal, 2 low, 474 spam
  - Transactional emails now properly categorized instead of urgent

### Fixed - 2025-12-04

- **UserPreferences.checkEmail()**: Added defensive null handling for undefined sender/subject values

### Tested - 2025-12-04 (Robustness)

- **557 emails**: ✅ 705ms scoring time
- **2000 emails**: ✅ Works reliably (recommended default)
- **5000 emails**: ❌ Gmail rate limiting - needs pagination for larger syncs

---

### Added - 2025-12-04 (Phase 5.5: User Preferences System)

- **User Preferences System**: Personalized email scoring based on user-defined rules
  - New config file: `config/user-preferences.json`
  - New class: `src/core/UserPreferences.ts` (singleton)
  - Priority hierarchy: VIP (100) > Self (75) > Important Services (floor 75) > Normal scoring

- **VIP Contact Override**: Family/work contacts get instant 100/urgent score
  - Pattern matching: email_contains, domain, email, name_contains
  - Example: `*family-name*` pattern catches all family members
  - Example: `yourcompany.com` domain catches all work emails

- **Self Email Tier**: User's own emails score 75/important (not urgent)
  - Prevents self-emails from consuming urgent slots
  - Leaves room for external high-priority emails

- **Important Services Floor**: Financial/medical/legal services always surface
  - Score floor of 75 (important category minimum)
  - Never filtered as spam even if they look like newsletters
  - Includes: banks, investment platforms, security services

- **Valuable Newsletter Exceptions**: Career-relevant newsletters treated as normal
  - Skip newsletter penalty for configured patterns
  - Example: Next Play newsletter (career coaching)

- **Heuristic Newsletter Detection**: Fallback for non-RFC-compliant senders
  - Sender domain patterns: mail.*, news.*, mailer.*, newsletter.*
  - Sender address patterns: info@, no-reply@, noreply@, newsletter@
  - Body content: unsubscribe link detection
  - Combined with RFC headers for comprehensive detection

### Changed - 2025-12-04

- **MessageFeatures Interface**: Added sender identity fields
  - `sender_email`, `sender_name`, `subject` for user preference matching
  - Enables pattern matching before feature extraction

- **PriorityScorer Algorithm**: Added Phase 0 (User Preferences)
  - Checks VIP/Self/Important Services BEFORE other scoring phases
  - Early return for VIP (100) and Self (75) cases
  - Skips newsletter penalty for important services and valuable newsletters

- **RFCGates**: Added `detectNewsletter()` method
  - RFC detection first (100% accurate)
  - Heuristic fallback for non-compliant senders
  - Returns method used ('rfc' | 'heuristic' | 'none')

### Fixed - 2025-12-04

- **Family Email Scoring**: Family member emails now score 100/urgent
  - Previously: 27/spam (detected as forwarded newsletter)
  - Root cause: VIP pattern matching added for family domain

- **Newsletter False Positives**: Non-RFC newsletters now detected
  - Previously: Some newsletters slipped through RFC-only detection
  - Added heuristic fallback for Lonely Planet, The Register, etc.

### Current State

| Category | Count | Examples |
|----------|-------|----------|
| Urgent (100) | 3 | Family, Deep Infra follow-up, Sticker Mule |
| Important (75) | 55 | Task Tracker emails, Important services |
| Normal (50-69) | 1 | |
| Spam (<30) | 138 | Newsletters |

### Known Issues

1. **Transactional Email Detection**: Shipping notifications (Sticker Mule) score 100
   - Root cause: "Track your order" triggers explicit_ask + action_request
   - Fix needed: Detect transactional email patterns (help@, orders@, etc.)

2. **Fifteenth Tax Email Missing**: Not in sync window (older than available history)
   - Not a code issue - IMAP limitation

---

### Added - 2025-10-31

- **SENT Folder Sync**: Full IMAP sync now fetches both INBOX and SENT folders
  - Enables accurate relationship scoring by tracking user replies
  - Auto-detects Gmail's `[Gmail]/Sent Mail` or standard SENT folders
  - Added `folder_type` column to database ('inbox', 'sent', 'other')
  - Indexed for fast queries
- **POST /rescore-all Endpoint**: Forces complete rescore of all emails
  - Use after syncing SENT folder or updating scoring algorithm
  - Batch processes up to 1000 emails with progress logging
  - Returns detailed statistics (scored count, duration, errors)
- **Pagination in Go TUI**: Keyboard shortcuts for navigating all emails
  - `n` key: Load next 50 emails
  - `g` key: Reset to first page
  - Status bar shows loading state and progress
- **ImapManager.syncAllFolders()**: New method for multi-folder sync
  - Returns separate arrays for inbox and sent emails
  - Fallback handling for different email providers
  - Folder metadata attached to each email

### Fixed - 2025-10-31

- **CRITICAL: Hardcoded User Email**: FeatureExtractor now uses `process.env.IMAP_USER` instead of `'user@example.com'`
  - This was breaking relationship scoring for ALL emails
  - Family/frequent contacts were scoring as strangers (27/spam)
  - Now correctly identifies user's email for reply tracking
- **Relationship Scoring**: RelationshipScorer now queries `folder_type='sent'` for accurate reply tracking
  - Previously couldn't find user's sent emails (no SENT folder data)
  - Now correctly calculates reply frequency and two-way exchanges
  - Dramatically improves scores for family/frequent contacts (27 → 70+)
- **AI API Error Handling**: Graceful fallback when Anthropic credits are low
  - Shows user-friendly warnings instead of stack traces
  - Automatically falls back to heuristic scoring
  - 5 AI functions updated (prioritize, summarize, quick replies, search, profile)
- **Pagination State Management**: Inbox component now properly tracks offset/limit/hasMore

### Changed - 2025-10-31

- `POST /sync` now syncs both INBOX and SENT folders
  - Returns separate counts: `inboxCount`, `sentCount`
  - Prioritizes both types of emails
- `EmailRecord` interface includes optional `folder_type` field
- `ParsedEmail` interface includes `folder` and `folderType` fields
- Database schema auto-migrates to add `folder_type` column on startup
- RelationshipScorer queries updated with folder_type filters

### Added - 2025-10-28

- **Synchronous Email Sync**: POST /sync endpoint now waits for completion instead of fire-and-forget
- **Sync Status Tracking**: Database tracks new vs existing emails during sync
- **Improved Sync Response**: Returns detailed status including `hasNewEmails`, `newEmailCount`, `totalFetched`
- **RFC-Based Priority Scoring Integration**: All sync operations now use RFC-compliant feature extraction
  - Newsletter detection (RFC 2369/2919)
  - Auto-generated email detection (RFC 3834)
  - Calendar invite parsing (RFC 5545)
  - OTP code detection (RFC 6238)

### Fixed - 2025-10-28

- **IMAP Sync Reliability**: Sync now provides completion feedback to frontend
- **Email Deduplication**: Proper tracking of new vs existing emails prevents unnecessary re-processing
- **Status Bar Integration**: Sync status now properly communicated to Go TUI via API response

### Changed - 2025-10-28

- `DatabaseManager.insertEmail()` now returns `boolean` indicating if email was new
- POST /sync response format updated to include sync statistics

---

## [2.0.0] - 2025-10-27

### Added

- Complete RFC-compliant priority scoring system (Weeks 1-3)
- Feature extraction pipeline with 22 email features
- Weighted linear model for 0-100 priority scores
- Full explainability with reasoning and feature weights
- 111 comprehensive tests (100% passing)
- Three new API endpoints for email scoring

### Major Components

- **FeatureExtractor**: Orchestrates all feature extraction (22 features)
- **PriorityScorer**: Weighted linear model with 5-phase algorithm
- **RelationshipScorer**: 6-month interaction history analysis
- **ContentAnalyzer**: Question/deadline/urgency detection
- **NewsletterGate**: RFC 2369/2919 newsletter detection
- **AutoGeneratedGate**: RFC 3834 automated message detection
- **CalendarGate**: RFC 5545 iCalendar parsing
- **OTPGate**: RFC 6238 TOTP code detection

### API Endpoints

- `POST /emails/score` - Score single email with explainability
- `POST /emails/score/batch` - Parallel batch scoring (10-50 concurrent)
- `POST /emails/rescore` - Rescore unprioritized emails

---

## [1.0.0] - 2025-09-24

### Initial Release

- SQLite database with FTS5 full-text search
- IMAP email synchronization
- SMTP email sending
- Basic AI prioritization (heuristic-based)
- React-Ink terminal UI (deprecated in 2.0)
- Core email operations (read, star, delete, search)

---

**Note**: For detailed development logs, see `docs/archive/DEVELOPMENT_PROGRESS_LOG.md`
