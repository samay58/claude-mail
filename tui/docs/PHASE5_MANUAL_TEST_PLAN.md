# Phase 5 Manual Test Plan

> Historical snapshot (2025-10-27). For current testing focus, see `tui/NEXT_STEPS.md`.

**Date**: 2025-10-27
**Phase**: Phase 5 - Search & Polish (100%)
**Purpose**: Validate all 4 Phase 5 features before beginning Phase 6

---

## 🎯 Test Objectives

1. Verify toast notification system works correctly
2. Validate status bar displays accurate information
3. Test search overlay functionality
4. Confirm help system is comprehensive and accessible

---

## ✅ Pre-Test Checklist

- [ ] Email agent running on port 5178
- [ ] `claude-mail` binary built (21MB)
- [ ] Terminal size at least 80x24 (recommended: 120x40+)
- [ ] Test email account has emails to work with

---

## 🧪 Test Suite

### Test 1: Application Launch & Status Bar
**Feature**: Status bar connection status
**File**: `internal/ui/statusbar/statusbar.go:197`

**Steps**:
1. Launch TUI: `./claude-mail`
2. Observe status bar at bottom of screen

**Expected Results**:
- ✅ Status bar visible at bottom (above help text)
- ✅ Connection indicator: `● inbox` (green dot)
- ✅ Current view shows "inbox"
- ✅ No error messages displayed

**What to Look For**:
- Green `●` circle indicates connected to agent
- View name displayed in bold white
- Status bar spans full width
- No overlap with other UI elements

**On Failure**:
- Gray `○` circle = agent not connected
- Red error message = check agent on port 5178

---

### Test 2: Help System
**Feature**: Comprehensive keyboard shortcuts reference
**File**: `internal/ui/help/help.go:247`

**Steps**:
1. Press `?` key to open help
2. Scroll through help content with `j/k` or arrow keys
3. Read all 7 categories
4. Press `Esc` or `q` to close

**Expected Results**:
- ✅ Help overlay centers on screen
- ✅ Orange border with "Help & Keyboard Shortcuts" title
- ✅ 7 organized categories visible:
  - Navigation
  - Email Actions
  - AI Features
  - Batch Operations
  - Organization
  - Search & Filter
  - System
- ✅ Scrollable content (if terminal < 50 lines)
- ✅ "Press Esc or q to close" at bottom
- ✅ Closes cleanly on Esc/q

**What to Look For**:
- All keyboard shortcuts listed (37 total)
- Clear categorization
- Readable formatting with consistent spacing
- No text cutoff or overlap

**On Failure**:
- Check terminal size (minimum 80x24)
- Verify no compilation errors

---

### Test 3: Search Overlay
**Feature**: Full-text search with syntax filters
**File**: `internal/ui/search/search.go:402`

**Steps**:
1. Press `/` to open search
2. Type a search query (e.g., "meeting")
3. Observe filtered results
4. Test syntax: `from:john@example.com`
5. Test syntax: `is:unread`
6. Test syntax: `is:starred`
7. Press `Esc` to close search

**Expected Results**:
- ✅ Search overlay opens centered
- ✅ Orange border with "Search Emails" title
- ✅ Cursor in input field
- ✅ Results filter as you type
- ✅ Search syntax works:
  - `from:email` - filters by sender
  - `to:email` - filters by recipient
  - `is:unread` - shows unread only
  - `is:starred` - shows starred only
- ✅ Result count displayed
- ✅ Search history saved (up to 20 entries)
- ✅ Closes on Esc

**What to Look For**:
- Incremental search (updates as you type)
- Clear result count: "X emails found"
- Search query remains visible in input
- No lag or freezing during search

**On Failure**:
- Check if emails exist matching query
- Verify database has indexed content

---

### Test 4: Toast Notifications - Email Sent
**Feature**: Success toast for sent emails
**File**: `internal/ui/toast/toast.go:188`

**Steps**:
1. Press `c` to compose email
2. Fill in To/Subject/Body
3. Press `Ctrl+S` to send
4. Observe top-right corner

**Expected Results**:
- ✅ Green toast appears: "Email sent successfully!"
- ✅ Toast auto-dismisses after 3 seconds
- ✅ Toast has rounded border
- ✅ Success icon: ✓
- ✅ View returns to inbox
- ✅ Status bar shows updated sync time

**What to Look For**:
- Toast positioned at top-right
- Green background (#00AA00)
- White text, readable
- Doesn't block email list
- Auto-dismiss timer works

**On Failure**:
- Check SMTP configuration in email agent
- Verify network connectivity

---

### Test 5: Toast Notifications - Bulk Operations
**Feature**: Bulk operation feedback
**File**: `internal/app/app.go` (BulkCompleteMsg handler)

**Steps**:
1. Press `x` to enter batch mode
2. Select 3-5 emails with `Space`
3. Press `r` to mark as read
4. Observe toast notification
5. Repeat with `s` to star selected
6. Try `d` to delete (with confirmation)

**Expected Results**:
- ✅ Success toast: "Marked as read: N emails updated"
- ✅ Success toast: "Starred: N emails updated"
- ✅ For delete: "Deleted: N succeeded, M failed" (if any fail)
- ✅ Green toast for 100% success
- ✅ Orange/yellow toast if any failures
- ✅ Toast shows action + count
- ✅ Inbox refreshes after operation

**What to Look For**:
- Accurate counts in toast message
- Warning toast (orange) if partial failures
- Success toast (green) if all succeed
- Inbox updates immediately

**On Failure**:
- Check batch operation permissions
- Verify API endpoints working

---

### Test 6: Toast Notifications - Error Handling
**Feature**: Error toast for API failures
**File**: `internal/app/app.go` (ErrorMsg handler)

**Steps**:
1. Stop the email agent (Ctrl+C in agent terminal)
2. Try to refresh inbox (wait for auto-refresh)
3. Observe error toast
4. Check status bar

**Expected Results**:
- ✅ Red error toast appears
- ✅ Error message displayed in toast
- ✅ Status bar shows red ⚠ warning
- ✅ Connection indicator shows gray `○` (disconnected)
- ✅ Error persists in status bar until resolved

**What to Look For**:
- Red toast background (#FF0000)
- Clear error message
- Status bar error in sync with toast
- Application doesn't crash

**Recovery**:
- Restart email agent
- Check connection indicator returns to green `●`

---

### Test 7: Status Bar - View Switching
**Feature**: Status bar tracks current view
**File**: `internal/ui/statusbar/statusbar.go` (SetCurrentView)

**Steps**:
1. Press `2` to switch to "urgent" view
2. Observe status bar
3. Press `3` for "important" view
4. Press `1` to return to "inbox"
5. Check status bar updates each time

**Expected Results**:
- ✅ Status bar shows current view name
- ✅ View name in bold white text
- ✅ Updates immediately on view change
- ✅ Format: `● viewname`

**What to Look For**:
- Instant updates (no delay)
- Correct view name displayed
- Bold formatting for emphasis

---

### Test 8: Status Bar - Sync Status
**Feature**: Last sync timestamp
**File**: `internal/ui/statusbar/statusbar.go` (renderRight)

**Steps**:
1. Let application run for 5+ minutes
2. Observe status bar right side
3. Trigger manual sync (if available)
4. Check timestamp updates

**Expected Results**:
- ✅ "Last sync: Xm ago" displayed
- ✅ Updates as time passes
- ✅ "⟳ Syncing..." during active sync
- ✅ Human-readable time format

**What to Look For**:
- Time updates (e.g., "2m ago" → "3m ago")
- Sync animation during refresh
- No timestamp freezing

---

### Test 9: Toast Queue Management
**Feature**: Maximum 3 visible toasts
**File**: `internal/ui/toast/toast.go` (Add method)

**Steps**:
1. Trigger multiple actions quickly:
   - Send 2 emails back-to-back
   - Mark batch as read
   - Star another batch
   - Try one more action
2. Observe toast display

**Expected Results**:
- ✅ Maximum 3 toasts visible at once
- ✅ Oldest toast removed when 4th added (FIFO)
- ✅ Toasts stack vertically
- ✅ Each toast auto-dismisses after 3 seconds
- ✅ Can manually dismiss with any keypress

**What to Look For**:
- Clean queue management
- No toast overlap
- Smooth addition/removal
- No UI performance issues

---

### Test 10: Toast Manual Dismiss
**Feature**: Dismiss toast with any key
**File**: `internal/ui/toast/toast.go` (Update method)

**Steps**:
1. Trigger a toast (send email)
2. Before auto-dismiss, press any key
3. Observe toast disappears immediately

**Expected Results**:
- ✅ Toast dismisses on first keypress
- ✅ Key still performs its normal action
- ✅ If multiple toasts, only top one dismissed
- ✅ Smooth removal animation

**What to Look For**:
- Instant response to keypress
- No interference with normal keyboard shortcuts
- Clean visual removal

---

### Test 11: Terminal Resize Behavior
**Feature**: Responsive layout adaptation
**Files**: All UI components

**Steps**:
1. Resize terminal window smaller (< 100 cols)
2. Observe component behavior
3. Resize larger (> 150 cols)
4. Check toast, status bar, overlays

**Expected Results**:
- ✅ Status bar adapts to width
- ✅ Status bar hidden if < 40 chars width
- ✅ Toasts reposition correctly
- ✅ Search/help overlays re-center
- ✅ No text cutoff or overflow
- ✅ Graceful degradation on narrow screens

**What to Look For**:
- Clean reflow of all elements
- No crashes or rendering errors
- Readable at all tested sizes

---

### Test 12: Integration Test - Complete Workflow
**Feature**: All Phase 5 features working together

**Steps**:
1. Launch application
2. Check status bar (connected, inbox view)
3. Press `?` to view help
4. Close help with Esc
5. Press `/` to search "urgent"
6. Select an email, press Enter
7. Press `r` to reply
8. Send reply (Ctrl+S)
9. Observe success toast
10. Enter batch mode (`x`)
11. Select 3 emails, mark read (`r`)
12. Observe bulk toast
13. Check status bar updates

**Expected Results**:
- ✅ All features accessible
- ✅ No conflicts between features
- ✅ Smooth transitions
- ✅ Toasts appear at appropriate times
- ✅ Status bar updates accurately
- ✅ No crashes or freezes

**What to Look For**:
- Seamless feature integration
- Consistent UI behavior
- Accurate feedback at each step

---

## 📊 Test Results Summary

### Pass Criteria
- ✅ All 12 tests pass
- ✅ No crashes or freezes
- ✅ All toasts display correctly
- ✅ Status bar updates accurately
- ✅ Search and help work smoothly
- ✅ No visual glitches

### Metrics to Record
- [ ] Application startup time: ___ seconds
- [ ] Search response time: ___ ms (subjective: "instant" / "fast" / "slow")
- [ ] Toast auto-dismiss timing: ___ seconds (should be ~3s)
- [ ] Memory usage (Activity Monitor): ___ MB (should be < 50MB)
- [ ] Build size: 21MB ✓

### Known Issues / Notes
```
Document any issues found during testing:

1. Issue:
   Steps to reproduce:
   Expected:
   Actual:

2. Issue:
   ...
```

---

## 🚀 Post-Test Actions

### If All Tests Pass ✅
1. Mark "Manual testing of all Phase 5 features" as complete
2. Create test results document
3. Begin Phase 6: Performance & Testing

### If Any Tests Fail ❌
1. Document specific failures
2. Identify root cause
3. Create fix plan
4. Retest after fixes
5. Update session log with findings

---

## 📝 Test Execution Log

**Tester**: _______________
**Date**: 2025-10-27
**Terminal**: _______________ (iTerm2, Alacritty, etc.)
**Terminal Size**: ___x___ (cols x rows)
**Test Duration**: ___ minutes

**Overall Result**: PASS / FAIL
**Phase 5 Status**: Ready for Phase 6 / Needs Fixes

**Notes**:
```
Add any observations, feedback, or suggestions here.
```

---

_This test plan validates all Phase 5 features are production-ready before beginning Phase 6 performance optimization._
