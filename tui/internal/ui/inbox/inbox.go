package inbox

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
	"github.com/samay58/claude-mail/tui/internal/ui/batch"
)

type Model struct {
	client *data.Client
	table  table.Model
	emails []types.EmailRow
	batch  batch.Model // Batch selection model
	width  int
	height int
	focus  bool

	// Pagination state for lazy loading
	offset      int
	limit       int
	hasMore     bool
	isLoading   bool
	totalLoaded int

	// Clear all confirmation state
	confirmClear bool
}

// KeyMap for inbox navigation
type KeyMap struct {
	Up       key.Binding
	Down     key.Binding
	Enter    key.Binding
	Star     key.Binding
	Sync     key.Binding
	Quit     key.Binding
	NextPage key.Binding
	GoToTop  key.Binding
	ClearAll key.Binding
}

var DefaultKeyMap = KeyMap{
	Up: key.NewBinding(
		key.WithKeys("up", "k"),
		key.WithHelp("↑/k", "up"),
	),
	Down: key.NewBinding(
		key.WithKeys("down", "j"),
		key.WithHelp("↓/j", "down"),
	),
	Enter: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("enter", "open"),
	),
	Star: key.NewBinding(
		key.WithKeys("t"),
		key.WithHelp("t", "star"),
	),
	Sync: key.NewBinding(
		key.WithKeys("s"),
		key.WithHelp("s", "sync"),
	),
	Quit: key.NewBinding(
		key.WithKeys("q", "ctrl+c"),
		key.WithHelp("q", "quit"),
	),
	NextPage: key.NewBinding(
		key.WithKeys("n"),
		key.WithHelp("n", "next page"),
	),
	GoToTop: key.NewBinding(
		key.WithKeys("g"),
		key.WithHelp("g", "go to top"),
	),
	ClearAll: key.NewBinding(
		key.WithKeys("X"), // Shift+X
		key.WithHelp("X", "clear all"),
	),
}

func New(client *data.Client) Model {
	// Create table columns
	columns := []table.Column{
		{Title: "Pri", Width: 5},
		{Title: "From", Width: 20},
		{Title: "Subject", Width: 40},
		{Title: "Date", Width: 10},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(10),
	)

	// Style the table
	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(styles.BorderNormal).
		BorderBottom(true).
		Bold(true).
		Foreground(styles.Primary)
	s.Selected = s.Selected.
		Foreground(styles.Text).
		Background(styles.Primary).
		Bold(true)

	t.SetStyles(s)

	return Model{
		client:      client,
		table:       t,
		emails:      []types.EmailRow{},
		batch:       batch.New(),
		focus:       true,
		offset:      0,
		limit:       50,
		hasMore:     true,
		isLoading:   false,
		totalLoaded: 0,
	}
}

func (m Model) Init() tea.Cmd {
	return m.fetchEmails()
}

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
	m.table.SetHeight(h - 4) // Leave room for header and footer
}

func (m *Model) SetFocus(focus bool) {
	m.focus = focus
	m.table.Focus()
	if !focus {
		m.table.Blur()
	}
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	var cmds []tea.Cmd

	// Handle batch-specific messages first
	switch msg := msg.(type) {
	case ClearCompleteMsg:
		// All emails cleared - reset to empty state
		m.emails = []types.EmailRow{}
		m.offset = 0
		m.totalLoaded = 0
		m.hasMore = false
		m.updateTableRows()
		return m, nil

	case batch.BulkActionRequestMsg:
		// Execute bulk action
		return m, m.executeBulkAction(msg.Action, msg.EmailIDs)

	case batch.BulkCompleteMsg:
		// Bulk operation completed - refresh table to remove checkboxes
		m.updateTableRows()
		// Also trigger email refresh to get updated status
		return m, m.fetchEmails()

	case batch.BulkProgressMsg:
		// Progress update - table will re-render automatically via batch.View()
		// No action needed here
	}

	// Update batch model
	var batchCmd tea.Cmd
	m.batch, batchCmd = m.batch.Update(msg)
	if batchCmd != nil {
		cmds = append(cmds, batchCmd)
	}

	switch msg := msg.(type) {
	case types.EmailsLoadedMsg:
		m.isLoading = false
		if msg.Append {
			// Lazy load: append new emails
			m.emails = append(m.emails, msg.Emails...)
			m.offset += len(msg.Emails)
			m.hasMore = len(msg.Emails) == m.limit
		} else {
			// Initial load or refresh: replace all emails
			m.emails = msg.Emails
			m.offset = len(msg.Emails)
			m.hasMore = len(msg.Emails) == m.limit
		}
		m.totalLoaded = len(m.emails)
		m.updateTableRows()
		return m, nil

	case tea.MouseMsg:
		// Handle mouse scroll for navigation
		if msg.Type == tea.MouseWheelUp {
			m.table.MoveUp(1)
		} else if msg.Type == tea.MouseWheelDown {
			m.table.MoveDown(1)
		}
		return m, nil

	case tea.KeyMsg:
		if !m.focus {
			return m, nil
		}

		// Handle clear confirmation dialog
		if m.confirmClear {
			switch msg.String() {
			case "y", "Y":
				m.confirmClear = false
				return m, m.executeClearAll()
			case "n", "N", "esc":
				m.confirmClear = false
				return m, nil
			}
			return m, nil
		}

		// Handle multi-select shortcuts first
		if msg.String() == "x" {
			// Toggle select mode (handled by batch model)
			// IMPORTANT: Refresh table rows to show/hide checkboxes
			m.updateTableRows()
			return m, batchCmd
		}

		// In select mode, handle selection shortcuts
		if m.batch.IsSelectMode() {
			switch msg.String() {
			case " ":
				// Toggle selection of current email
				if len(m.emails) > 0 {
					selected := m.table.Cursor()
					if selected < len(m.emails) {
						m.batch.ToggleSelection(m.emails[selected].ID)
						m.updateTableRows()
					}
				}
				return m, nil

			case "a":
				// Select all visible emails
				emailIDs := make([]string, len(m.emails))
				for i, email := range m.emails {
					emailIDs[i] = email.ID
				}
				m.batch.SelectAll(emailIDs)
				m.updateTableRows()
				return m, nil

			case "i":
				// Invert selection
				emailIDs := make([]string, len(m.emails))
				for i, email := range m.emails {
					emailIDs[i] = email.ID
				}
				m.batch.InvertSelection(emailIDs)
				m.updateTableRows()
				return m, nil

			case "esc":
				// Exit select mode and clear selections
				m.batch.Reset()
				m.updateTableRows()
				return m, nil
			}

			// Let batch handle bulk action keys
			if batchCmd != nil {
				return m, batchCmd
			}
		}

		// Normal mode shortcuts
		if !m.batch.IsSelectMode() {
			switch {
			case key.Matches(msg, DefaultKeyMap.Enter):
				if len(m.emails) > 0 {
					selected := m.table.Cursor()
					if selected < len(m.emails) {
						email := m.emails[selected]
						return m, func() tea.Msg {
							return OpenEmailMsg{EmailID: email.ID}
						}
					}
				}

			case key.Matches(msg, DefaultKeyMap.Star):
				if len(m.emails) > 0 {
					selected := m.table.Cursor()
					if selected < len(m.emails) {
						email := m.emails[selected]
						return m, func() tea.Msg {
							err := m.client.ToggleStar(email.ID, !email.IsStarred)
							if err != nil {
								return types.ErrorMsg{Err: err}
							}
							return m.fetchEmails()()
						}
					}
				}

		case key.Matches(msg, DefaultKeyMap.Sync):
			// Send sync started message - app.go will trigger the actual sync
			// This ensures "Syncing..." shows before the blocking HTTP call
			return m, func() tea.Msg { return types.SyncStartedMsg{} }

			case key.Matches(msg, DefaultKeyMap.NextPage):
				// Load next page of emails
				if m.hasMore && !m.isLoading {
					return m, m.loadMore()
				}
				return m, nil

			case key.Matches(msg, DefaultKeyMap.GoToTop):
				// Reset to first page and reload
				m.offset = 0
				m.emails = []types.EmailRow{}
				m.totalLoaded = 0
				m.hasMore = true
				m.table.SetCursor(0)
				return m, m.fetchEmails()

			case key.Matches(msg, DefaultKeyMap.ClearAll):
				// Show confirmation dialog for clearing all emails
				m.confirmClear = true
				return m, nil
			}
		}
	}

	// Update table
	var tableCmd tea.Cmd
	m.table, tableCmd = m.table.Update(msg)
	if tableCmd != nil {
		cmds = append(cmds, tableCmd)
	}

	// Lazy loading: Check if cursor is near bottom
	if !m.isLoading && m.hasMore && len(m.emails) > 0 {
		cursor := m.table.Cursor()
		// Trigger load when within 10 rows of bottom
		if cursor >= len(m.emails)-10 {
			cmds = append(cmds, m.loadMore())
		}
	}

	return m, tea.Batch(cmds...)
}

func (m Model) View() string {
	var b strings.Builder

	// Header
	title := styles.TitleStyle.Render("📥 Inbox")
	count := styles.SubtitleStyle.Render(fmt.Sprintf("(%d emails)", len(m.emails)))

	// Show select mode indicator
	if m.batch.IsSelectMode() {
		selectIndicator := styles.PrimaryStyle.Render(fmt.Sprintf(" [SELECT MODE: %d selected]", m.batch.GetSelectedCount()))
		b.WriteString(title + " " + count + selectIndicator + "\n")
	} else {
		b.WriteString(title + " " + count + "\n")
	}

	// Table
	borderStyle := styles.BorderStyle
	if m.focus {
		borderStyle = styles.FocusedBorderStyle
	}
	b.WriteString(borderStyle.Render(m.table.View()))

	// Batch action bar (if in select mode with selections)
	batchView := m.batch.View()
	if batchView != "" {
		b.WriteString("\n" + batchView)
	}

	// Footer with selected email info (only if not in select mode)
	if !m.batch.IsSelectMode() && len(m.emails) > 0 {
		selected := m.table.Cursor()
		if selected < len(m.emails) {
			email := m.emails[selected]
			footer := fmt.Sprintf("%d of %d • %s from %s",
				selected+1, len(m.emails),
				email.Subject, email.From)

			// Add loading indicator if fetching more
			if m.isLoading {
				footer += " • ⟳ Loading more..."
			} else if !m.hasMore {
				footer += " • (All loaded)"
			}

			b.WriteString("\n" + styles.HelpStyle.Render(footer))
		}
	}

	// Clear all confirmation dialog
	if m.confirmClear {
		confirmStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FF6B6B")).
			Bold(true)
		confirm := confirmStyle.Render(fmt.Sprintf("\n⚠️  CLEAR ALL %d EMAILS? This cannot be undone. [Y/N]", len(m.emails)))
		b.WriteString(confirm)
	}

	return b.String()
}

func (m *Model) updateTableRows() {
	rows := make([]table.Row, len(m.emails))
	for i, email := range m.emails {
		// Selection indicator (if in select mode)
		var selectionPrefix string
		if m.batch.IsSelectMode() {
			if m.batch.IsSelected(email.ID) {
				selectionPrefix = "[✓] "
			} else {
				selectionPrefix = "[ ] "
			}
		}

		// Priority indicator
		priStr := fmt.Sprintf("%s%d", styles.PriorityIcon(email.PriorityCategory), email.Priority)

		// Truncate fields to fit (adjust for selection prefix)
		fromMaxLen := 20
		if m.batch.IsSelectMode() {
			fromMaxLen = 16 // Make room for checkbox
		}
		from := truncate(email.From, fromMaxLen)

		// Add selection prefix and unread indicator
		if !email.IsRead {
			from = selectionPrefix + "• " + from
		} else {
			from = selectionPrefix + from
		}

		subject := truncate(email.Subject, 40)

		rows[i] = table.Row{
			priStr,
			from,
			subject,
			email.DateShort,
		}
	}
	m.table.SetRows(rows)
}

func (m Model) fetchEmails() tea.Cmd {
	return func() tea.Msg {
		emails, err := m.client.ListEmails(0, 50, "")
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.EmailsLoadedMsg{Emails: emails, Append: false}
	}
}

// loadMore fetches the next batch of emails for lazy loading
func (m *Model) loadMore() tea.Cmd {
	if m.isLoading || !m.hasMore {
		return nil
	}

	m.isLoading = true

	return func() tea.Msg {
		emails, err := m.client.ListEmails(m.offset, m.limit, "")
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.EmailsLoadedMsg{Emails: emails, Append: true}
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

// executeBulkAction performs a bulk action on selected emails
func (m Model) executeBulkAction(action string, emailIDs []string) tea.Cmd {
	return func() tea.Msg {
		// Track progress
		total := len(emailIDs)

		// Send initial progress
		progressMsg := batch.BulkProgressMsg{
			Current: 0,
			Total:   total,
			Action:  fmt.Sprintf("Processing %s...", action),
		}

		// Execute bulk action using new bulk endpoints
		var err error
		var successCount, failureCount int

		switch action {
		case "read":
			err = m.client.BulkToggleRead(emailIDs, true)
		case "unread":
			err = m.client.BulkToggleRead(emailIDs, false)
		case "star":
			err = m.client.BulkToggleStar(emailIDs, true)
		case "unstar":
			err = m.client.BulkToggleStar(emailIDs, false)
		case "delete":
			err = m.client.BulkDelete(emailIDs)
		case "archive":
			err = m.client.BulkArchive(emailIDs)
		}

		if err != nil {
			failureCount = total
			successCount = 0
		} else {
			successCount = total
			failureCount = 0
		}

		// Update progress to complete
		progressMsg.Current = total

		// Return completion message
		completeMsg := batch.BulkCompleteMsg{
			Action:       action,
			SuccessCount: successCount,
			FailureCount: failureCount,
		}

		// Refresh emails after bulk operation
		emails, _ := m.client.ListEmails(0, 50, "")

		return tea.Batch(
			func() tea.Msg { return completeMsg },
			func() tea.Msg { return types.EmailsLoadedMsg{Emails: emails, Append: false} },
		)()
	}
}

// OpenEmailMsg signals that an email should be opened
type OpenEmailMsg struct {
	EmailID string
}

// ClearCompleteMsg signals that all emails have been cleared
type ClearCompleteMsg struct {
	Deleted int
}

// executeClearAll permanently deletes all emails from the database
func (m Model) executeClearAll() tea.Cmd {
	return func() tea.Msg {
		deleted, err := m.client.ClearAllEmails()
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return ClearCompleteMsg{Deleted: deleted}
	}
}
