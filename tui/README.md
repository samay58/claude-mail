# Claude Mail TUI

Go terminal interface for Claude Mail, built with [Bubble Tea](https://github.com/charmbracelet/bubbletea).

**For setup and usage, see the main [README](../README.md) at the repository root.**

## Features

- Multi-pane layout (navigation + inbox + preview)
- Priority indicators (🔴 urgent, 🟠 important, 🟢 normal, ⚫ low)
- Vim-style keyboard navigation
- Full-text search with filters
- Batch operations (multi-select, bulk actions)
- AI features (summarization, quick replies)
- Email composer with draft suggestions

## Keyboard Shortcuts

### Navigation
- `j/k` - Move up/down
- `Tab` - Switch panes
- `Enter` - Open email
- `Esc` - Go back
- `q` - Quit

### Actions
- `c` - Compose
- `r` - Reply
- `f` - Forward
- `t` - Toggle star
- `s` - Sync emails
- `/` - Search
- `?` - Help

### Batch Mode
- `x` - Toggle select mode
- `Space` - Select/deselect
- `a` - Select all

## Development

```bash
cd tui
go build -o claudemail ./cmd/claudemail
./claudemail
```

Requires the backend API running on port 5178. See [backend/README.md](../backend/README.md).
