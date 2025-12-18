# Claude Mail TUI - Master Roadmap

**Project**: Terminal Email Client with AI-Native Features
**Architecture**: Node.js backend + Go Bubble Tea TUI
**Status**: Readability + UX reliability pass complete; performance/testing next
**Last Updated**: 2025-12-18

---

## Current Focus (Phase 6: Performance & UX Reliability)

- Search responsiveness and relevance (fast, fuzzy, predictable)
- Clean body rendering + reliable keyboard controls
- Overlay behavior and focus hygiene

---

## Next Up (Phase 6 -> Phase 7)

- Persist `body_clean` in the database for faster previews and scoring
- Improve search ranking (prefix + fuzzy matching, better scoring)
- Inbox declutter tools (bundle tuning, newsletter suppression, thread folding)
- Cross-terminal performance/compatibility testing

---

## Later Roadmap

- Adaptive scoring from user feedback
- Custom filters + per-user scoring adjustments
- Follow-up reminders / snooze
- Cleaner preview formatting (layout-aware HTML stripping)

---

## Completed Highlights

- Go TUI foundation (multi-pane layout + keyboard-first nav)
- Batch operations + bulk actions
- Search overlay with filters
- AI summaries + quick replies
- Clean body preview with raw/quoted toggles

---

For detailed tasks, see `tui/NEXT_STEPS.md`. For backend status, see `backend/PROJECT_STATUS.md`.
