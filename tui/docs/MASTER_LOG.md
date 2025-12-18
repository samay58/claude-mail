# Claude Mail TUI - Master Progress Log

**Last Updated**: 2025-12-18
**Current Focus**: UX reliability + clean body rendering + search performance
**Overall Status**: Core features stable; polish + performance in progress

---

## Project Overview

Claude Mail TUI is a keyboard-first terminal email client with a three-pane layout (nav + inbox + preview). It sits on top of the Node.js backend, which handles IMAP sync, storage, scoring, and AI features.

---

## Recent Progress

### 2025-12-18 - Clean Body + UX Reliability
- Clean body extraction added (drops CSS/MJML/template noise, splits quoted text)
- Preview defaults to clean text with `v` (raw/clean) and `q` (quoted) toggles
- Search overlay keeps input focus; 2+ char gate for fast typing
- Overlay key isolation to prevent global shortcuts from hijacking input

### 2025-12-16 - Search Performance Overhaul
- Request cancellation + debounce fixes
- Query caching and pooled HTTP client
- FTS prefix queries + LIKE fallback for short tokens
- Reduced list payload size for faster rendering

---

## Key Learnings

1. **Plain-text can be worse than HTML**: email template CSS frequently leaks into text/plain; a cleaning step is required.
2. **Input focus is the UX**: search must stay in the input field to support rapid refine-and-scroll cycles.
3. **Use clean content for scoring**: template noise distorts intent signals.

---

## Next Steps (Shortlist)

- Persist `body_clean` in the database to avoid re-cleaning at render time.
- Improve search relevance with better ranking + fuzzy matching (prefix + trigram).
- Reduce inbox clutter with bundle tweaks, newsletter suppression, and thread folding.
- Performance/testing pass across terminals.

---

## References

- `tui/NEXT_STEPS.md`
- `tui/MASTER_ROADMAP.md`
- `backend/PROJECT_STATUS.md`
