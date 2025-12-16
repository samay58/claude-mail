# Phase 2 Testing Guide

## Build Status: ✅ SUCCESSFUL

The Go TUI compiled successfully with all Phase 2 features implemented.

## Node Agent Status: ✅ RUNNING

```bash
$ curl http://localhost:5178/health
{"ok":true,"timestamp":"2025-10-27T07:16:54.167Z","ai_configured":true,"smtp_configured":true}
```

## Manual Testing Checklist

Since the TUI requires an interactive terminal (not available in automated testing), perform these manual tests:

### 1. Three-Pane Layout (Wide Terminal ≥100 cols)

```bash
# Ensure terminal is wide (≥100 columns)
./bin/claudemail
```

**Expected Results:**
- ✅ Navigation pane visible on left (~20% width)
- ✅ Inbox pane in center (~35% width)
- ✅ Preview pane on right (~45% width)
- ✅ Subtle dividers (│) between panes
- ✅ Header shows "✉️ Claude Mail" with stats
- ✅ Footer shows context-aware keyboard shortcuts

**Visual Verification:**
```
┌───────────────────────────────────────────────────────────────┐
│ ✉️  Claude Mail    42 emails • 5 unread • 12 contacts         │
├─────────────┬──────────────────────┬──────────────────────────┤
│ Views       │                      │                          │
│ 1 📥 Inbox  │ Priority  From   ... │ Email Detail             │
│ 2 ⭐ Starred│ 🔴85     John...    │ Subject: ...             │
│ 3 📤 Sent   │ 🟠70     Mary...    │                          │
│ ...         │ ...                  │ Body text...             │
│             │                      │                          │
│ Smart...    │                      │ [r] Reply [a] Reply All  │
└─────────────┴──────────────────────┴──────────────────────────┘
│ ↑↓: navigate • enter: select • 1-9,0: quick switch • tab...   │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Two-Pane Layout (Medium Terminal <100 cols)

```bash
# Resize terminal to <100 columns
# Or run in smaller terminal
./bin/claudemail
```

**Expected Results:**
- ✅ Navigation pane HIDDEN
- ✅ Inbox pane on left (~40% width)
- ✅ Preview pane on right (~60% width)
- ✅ Number keys (1-9, 0) still work for view switching
- ✅ Footer updates to show inbox/preview shortcuts only

**Visual Verification:**
```
┌──────────────────────────────────────────────┐
│ ✉️  Claude Mail    42 emails • 5 unread     │
├──────────────────┬───────────────────────────┤
│ Priority  From   │ Email Detail              │
│ 🔴85     John... │ Subject: Meeting Request  │
│ 🟠70     Mary... │                           │
│ ...              │ Body text...              │
└──────────────────┴───────────────────────────┘
│ j/k: navigate • enter: open • tab: pane...  │
└──────────────────────────────────────────────┘
```

### 3. Navigation Keyboard Shortcuts

Test all keyboard shortcuts in wide mode:

#### Number Keys (Global View Switching)
- `1` → Inbox view
- `2` → Starred view
- `3` → Sent view
- `4` → Drafts view
- `5` → All Mail view
- `6` → Urgent bundle (🔴 priority ≥90)
- `7` → Important bundle (🟠 priority 70-89)
- `8` → Needs Reply bundle (💬 questions + unread)
- `9` → Calendar bundle (📅 meeting keywords)
- `0` → Newsletter bundle (📰 bulk/promotional)

**Expected Results:**
- ✅ Pressing any number key instantly switches view
- ✅ Inbox pane updates with filtered emails
- ✅ View counts update in navigation pane
- ✅ Works from ANY focused pane (nav/inbox/preview)

#### Focus Cycling
- `Tab` → Cycle forward (nav → inbox → preview → nav)
- `Shift+Tab` → Cycle backward (preview → inbox → nav → preview)

**Expected Results:**
- ✅ Border color changes to orange (#FF6B35) on focused pane
- ✅ Footer help text updates based on focused pane
- ✅ Keyboard shortcuts apply to currently focused pane

#### Vim-Style Navigation
- `h` → Move focus left (preview→inbox, inbox→nav)
- `l` → Move focus right (nav→inbox, inbox→preview)

**Expected Results:**
- ✅ h/l moves focus between adjacent panes
- ✅ Does nothing when already at edge

#### Direct Pane Access
- `g` → Jump to navigation pane
- `i` → Jump to inbox pane
- `p` → Jump to preview pane

**Expected Results:**
- ✅ Instantly switches focus to specified pane
- ✅ Border and footer update accordingly

#### Inbox Actions (when inbox focused)
- `j` / `↓` → Next email
- `k` / `↑` → Previous email
- `Enter` → Open email in preview
- `t` → Toggle star
- `s` → Sync emails
- `q` → Quit application

**Expected Results:**
- ✅ Cursor moves through email list
- ✅ Enter switches focus to preview and loads email
- ✅ Star icon updates immediately
- ✅ Sync triggers background IMAP fetch

#### Preview Actions (when preview focused)
- `j` / `↓` → Scroll down
- `k` / `↑` → Scroll up
- `r` → Reply
- `a` → Reply all
- `f` → Forward
- `Esc` → Return to inbox

**Expected Results:**
- ✅ Email body scrolls smoothly
- ✅ Reply actions open composer (future Phase 3)
- ✅ Esc returns focus to inbox

### 4. Smart Bundle Classification

Test each bundle to verify filtering logic:

#### Urgent Bundle (Press `6`)
**Expected**: Only emails with priority_score ≥ 90
- Check that all displayed emails have 🔴 red priority indicator
- Verify count matches /bundles API endpoint

#### Important Bundle (Press `7`)
**Expected**: Only emails with priority_score 70-89
- Check that all displayed emails have 🟠 orange priority indicator
- No urgent (🔴) or normal (🟢) emails shown

#### Needs Reply Bundle (Press `8`)
**Expected**: Emails with:
- Contains "?" in body
- is_read = false
- priority_score ≥ 60

**Verification**: Check email snippets for questions

#### Calendar Bundle (Press `9`)
**Expected**: Emails matching keywords:
- meeting, calendar, invite, rsvp, zoom, teams (case-insensitive)

**Verification**: Check subjects contain calendar-related terms

#### Newsletter Bundle (Press `0`)
**Expected**: Emails with:
- "newsletter", "unsubscribe", "promotional", "deal", "offer" in body
- OR sender contains "newsletter", "noreply", "no-reply"

**Verification**: Check sender emails and content

### 5. Node Agent Integration

Test API endpoints:

```bash
# Get bundle counts
curl http://localhost:5178/bundles

# Expected output:
{
  "urgent": 5,
  "important": 12,
  "needs_reply": 8,
  "calendar": 4,
  "newsletter": 45
}

# Filter emails by view
curl "http://localhost:5178/emails?view=urgent&limit=10"
# Should return only high-priority emails

curl "http://localhost:5178/emails?view=calendar&limit=10"
# Should return only calendar-related emails
```

**Expected Results:**
- ✅ /bundles returns accurate counts
- ✅ ?view= parameter filters correctly
- ✅ All 10 views (5 standard + 5 bundles) work

### 6. Responsive Behavior

```bash
# Test breakpoint at exactly 100 columns
# Resize terminal to 100 cols → should show 3 panes
# Resize to 99 cols → nav should disappear
```

**Expected Results:**
- ✅ Smooth transition at 100 column breakpoint
- ✅ No layout jumping or text overflow
- ✅ All panes maintain proper proportions
- ✅ Dividers adjust correctly

### 7. Focus Management

Test focus indicators:

**When nav focused:**
- ✅ Nav border is orange (#FF6B35)
- ✅ Footer shows: "↑↓: navigate • enter: select • 1-9,0: quick switch..."

**When inbox focused:**
- ✅ Inbox border is orange
- ✅ Footer shows: "j/k: navigate • enter: open • t: star..."

**When preview focused:**
- ✅ Preview border is orange
- ✅ Footer shows: "j/k: scroll • r: reply • a: reply all..."

### 8. Edge Cases

- **Empty inbox**: Should display "No emails" message
- **Network error**: Should show error in UI, not crash
- **Missing agent**: Should display connection error
- **Invalid view**: Should fallback to inbox
- **Narrow terminal (<80 cols)**: Should still be usable (may wrap)

## Integration Test Commands

```bash
# 1. Build
go build -o bin/claudemail ./cmd/claudemail

# 2. Start agent (in separate terminal)
cd /Users/samaydhawan/email-agent
npm run agent

# 3. Verify agent health
curl http://localhost:5178/health

# 4. Run TUI
cd /Users/samaydhawan/claude-mail-tui
./bin/claudemail

# 5. Test shortcuts
Press 1, 2, 3... to switch views
Press Tab to cycle focus
Press h/l for vim navigation
Press q to quit
```

## Known Limitations

1. **TTY Requirement**: TUI cannot run in background or non-interactive shells
2. **Manual Testing Only**: Automated TUI testing requires specialized frameworks
3. **Terminal Size**: Optimal experience requires ≥100 columns × 30 rows
4. **Mouse Support**: Enabled but keyboard shortcuts recommended

## Success Criteria

Phase 2 is considered COMPLETE when:

- ✅ Go binary builds without errors
- ✅ Node agent responds to /bundles and /emails?view= endpoints
- ✅ Three-pane layout renders correctly (wide terminal)
- ✅ Two-pane layout works (medium terminal)
- ✅ All 10 number keys switch views correctly
- ✅ Tab/h/l navigation cycles focus smoothly
- ✅ Smart bundles filter emails accurately
- ✅ Context-aware footer updates based on focus
- ✅ No UI jumping or layout issues

## Next Steps (Phase 3)

After manual testing confirms Phase 2 success:

1. Update SESSION_LOG.md to mark Phase 2 complete
2. Update SETUP.md with new keyboard shortcuts
3. Begin Phase 3: AI-native features (compose, quick replies, summarization)
