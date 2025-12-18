package search

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
)

const (
	debounceDelay = 100 * time.Millisecond
	minQueryLen   = 2
)

// Model represents the search overlay
type Model struct {
	client      *data.Client
	searchInput textinput.Model
	table       table.Model
	results     []types.EmailRow
	history     []string
	historyIdx  int

	// Search state
	searching    bool
	lastQuery    string
	pendingQuery string
	debounceID   int                    // Incremented to cancel stale debounce ticks
	cancelFunc   context.CancelFunc     // Cancel in-flight HTTP requests
	searchID     int                    // Incremented to ignore stale results

	width  int
	height int
}

// debounceMsg is sent after the debounce delay
type debounceMsg struct {
	query string
	id    int
}

// New creates a new search model
func New(client *data.Client) Model {
	// Create search input
	input := textinput.New()
	input.Placeholder = "Search emails... (try: from:user@example.com or is:unread)"
	input.Focus()
	input.CharLimit = 200
	input.Width = 80

	// Create results table
	columns := []table.Column{
		{Title: "Pri", Width: 5},
		{Title: "From", Width: 20},
		{Title: "Subject", Width: 40},
		{Title: "Date", Width: 10},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(false),
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
		searchInput: input,
		table:       t,
		results:     []types.EmailRow{},
		history:     []string{},
		historyIdx:  -1,
		debounceID:  0,
	}
}

// Init initializes the search component
func (m Model) Init() tea.Cmd {
	return textinput.Blink
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc":
			// Close search overlay
			return m, func() tea.Msg {
				return CloseSearchMsg{}
			}

		case "enter":
			// Open selected email or execute search
			if m.table.Focused() && len(m.results) > 0 {
				selected := m.table.Cursor()
				if selected < len(m.results) {
					email := m.results[selected]
					return m, func() tea.Msg {
						return OpenEmailMsg{EmailID: email.ID}
					}
				}
			} else {
				// Execute search immediately
				query := m.searchInput.Value()
				if isQueryReady(query) && query != m.lastQuery {
					m.lastQuery = query
					m.searching = true
					m.debounceID++ // Cancel any pending debounce
					return m, m.executeSearch(query)
				}
			}

		case "tab":
			// Toggle focus between input and results
			if m.table.Focused() {
				m.table.Blur()
				m.searchInput.Focus()
			} else if len(m.results) > 0 {
				m.searchInput.Blur()
				m.table.Focus()
			}
			return m, nil

		case "up", "down":
			// If table is focused, let it handle navigation
			if m.table.Focused() {
				var tableCmd tea.Cmd
				m.table, tableCmd = m.table.Update(msg)
				return m, tableCmd
			}

			// If input is empty, navigate history
			if m.searchInput.Value() == "" {
				if msg.String() == "up" && m.historyIdx < len(m.history)-1 {
					m.historyIdx++
					if m.historyIdx >= 0 && m.historyIdx < len(m.history) {
						m.searchInput.SetValue(m.history[m.historyIdx])
					}
				} else if msg.String() == "down" && m.historyIdx >= 0 {
					m.historyIdx--
					if m.historyIdx >= 0 {
						m.searchInput.SetValue(m.history[m.historyIdx])
					} else {
						m.searchInput.SetValue("")
					}
				}
				return m, nil
			}

		case "ctrl+l":
			// Clear search
			m.searchInput.SetValue("")
			m.results = []types.EmailRow{}
			m.lastQuery = ""
			m.pendingQuery = ""
			m.searching = false
			m.updateTableRows()
			m.searchInput.Focus()
			m.table.Blur()
			return m, nil
		}

	case debounceMsg:
		// Only execute if this debounce is still current
		if msg.id == m.debounceID && msg.query == m.pendingQuery {
			m.lastQuery = msg.query
			m.searching = true
			return m, m.executeSearch(msg.query)
		}
		return m, nil

	case SearchResultsMsg:
		// Ignore stale results from cancelled requests
		if msg.SearchID != m.searchID {
			return m, nil
		}

		// Preserve selection if possible
		selectedID := ""
		if len(m.results) > 0 {
			cursor := m.table.Cursor()
			if cursor >= 0 && cursor < len(m.results) {
				selectedID = m.results[cursor].ID
			}
		}

		m.searching = false
		m.results = msg.Results
		m.updateTableRows()

		// Restore selection when possible
		if selectedID != "" {
			for i, email := range m.results {
				if email.ID == selectedID {
					m.table.SetCursor(i)
					break
				}
			}
		} else if len(m.results) > 0 {
			m.table.SetCursor(0)
		}

		// Add to history if not empty and different from last
		if m.lastQuery != "" && (len(m.history) == 0 || m.history[0] != m.lastQuery) {
			m.history = append([]string{m.lastQuery}, m.history...)
			if len(m.history) > 20 {
				m.history = m.history[:20]
			}
		}
		m.historyIdx = -1

		return m, nil

	case types.ErrorMsg:
		m.searching = false
		return m, nil
	}

	// Update text input if not table-focused
	if !m.table.Focused() {
		oldValue := m.searchInput.Value()
		var cmd tea.Cmd
		m.searchInput, cmd = m.searchInput.Update(msg)
		cmds = append(cmds, cmd)

		newValue := m.searchInput.Value()
		if newValue != oldValue {
			// Schedule debounced search only when query is ready
			if isQueryReady(newValue) {
				m.pendingQuery = newValue
				m.debounceID++
				currentID := m.debounceID

				cmds = append(cmds, tea.Tick(debounceDelay, func(t time.Time) tea.Msg {
					return debounceMsg{query: newValue, id: currentID}
				}))
			} else {
				// Cancel in-flight request and clear results for short queries
				if m.cancelFunc != nil {
					m.cancelFunc()
					m.cancelFunc = nil
				}
				m.pendingQuery = ""
				m.searching = false
				m.lastQuery = ""
				m.results = []types.EmailRow{}
				m.updateTableRows()
			}
		}
	}

	// Update table if focused
	if m.table.Focused() {
		var tableCmd tea.Cmd
		m.table, tableCmd = m.table.Update(msg)
		cmds = append(cmds, tableCmd)
	}

	return m, tea.Batch(cmds...)
}

// View renders the search overlay
func (m Model) View() string {
	var b strings.Builder

	// Title
	title := styles.TitleStyle.Render("🔍 Search Emails")
	b.WriteString(title)
	b.WriteString("\n\n")

	// Search input
	inputLabel := lipgloss.NewStyle().
		Foreground(styles.TextMuted).
		Render("Query: ")
	b.WriteString(inputLabel + m.searchInput.View())
	b.WriteString("\n\n")

	// Search status
	if m.searching {
		status := lipgloss.NewStyle().
			Foreground(styles.Primary).
			Render("⟳ Searching...")
		b.WriteString(status)
		b.WriteString("\n\n")
	} else if len(m.results) > 0 {
		status := lipgloss.NewStyle().
			Foreground(styles.Success).
			Render(fmt.Sprintf("✓ Found %d results", len(m.results)))
		b.WriteString(status)
		b.WriteString("\n\n")
	} else if m.searchInput.Value() != "" && !isQueryReady(m.searchInput.Value()) {
		status := lipgloss.NewStyle().
			Foreground(styles.TextMuted).
			Render("Type at least 2 characters to search")
		b.WriteString(status)
		b.WriteString("\n\n")
	} else if m.lastQuery != "" {
		status := lipgloss.NewStyle().
			Foreground(styles.TextMuted).
			Render("No results found")
		b.WriteString(status)
		b.WriteString("\n\n")
	}

	// Results table
	if len(m.results) > 0 {
		borderStyle := lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(styles.Primary).
			Padding(0, 1)
		b.WriteString(borderStyle.Render(m.table.View()))
		b.WriteString("\n\n")
	}

	// Search syntax help
	help := lipgloss.NewStyle().
		Foreground(styles.TextMuted).
		Render("Filters: from:user@example.com • to:user@example.com • is:unread • is:starred")
	b.WriteString(help)
	b.WriteString("\n")

	// Keyboard help
	keys := styles.HelpStyle.Render("enter: search/open • tab: switch • ↑/↓: navigate • ctrl+l: clear • esc: close")
	b.WriteString(keys)

	return b.String()
}

// SetSize sets the component size
func (m *Model) SetSize(width, height int) {
	m.width = width
	m.height = height
	m.searchInput.Width = width - 20
	m.table.SetHeight(height - 15)
}

// Activate focuses the input without clearing results (fast return to search)
func (m *Model) Activate() {
	m.searchInput.Focus()
	m.table.Blur()
}

// Reset clears the search state (call when opening search overlay)
func (m *Model) Reset() {
	// Cancel any in-flight requests
	if m.cancelFunc != nil {
		m.cancelFunc()
		m.cancelFunc = nil
	}

	m.searchInput.SetValue("")
	m.searchInput.Focus()
	m.table.Blur()
	m.results = []types.EmailRow{}
	m.lastQuery = ""
	m.pendingQuery = ""
	m.searching = false
	m.historyIdx = -1
	m.debounceID++
	m.searchID++
	m.updateTableRows()
}

// Helper methods

func (m *Model) updateTableRows() {
	rows := make([]table.Row, len(m.results))
	for i, email := range m.results {
		// Priority indicator
		priStr := fmt.Sprintf("%s%d", styles.PriorityIcon(email.PriorityCategory), email.Priority)

		// Truncate fields to fit
		from := truncate(email.From, 20)
		if !email.IsRead {
			from = "• " + from
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

func (m *Model) executeSearch(query string) tea.Cmd {
	if !isQueryReady(query) {
		return nil
	}

	// Cancel any previous in-flight request
	if m.cancelFunc != nil {
		m.cancelFunc()
	}

	// Create new context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	m.cancelFunc = cancel
	m.searchID++
	currentSearchID := m.searchID

	return func() tea.Msg {
		// Parse search query for filters
		parsedQuery, filters := parseSearchQuery(query)

		// Build API query with prefix matching
		apiQuery := buildSearchQuery(parsedQuery, filters)

		// Fetch results with context for cancellation
		emails, err := m.client.ListEmailsByViewWithContext(ctx, 0, 200, apiQuery, "")
		if err != nil {
			// Ignore cancelled requests silently
			if ctx.Err() == context.Canceled {
				return nil
			}
			return types.ErrorMsg{Err: err}
		}

		// Apply client-side filters
		filtered := filterResults(emails, filters)

		return SearchResultsMsg{Results: filtered, SearchID: currentSearchID}
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

// parseSearchQuery extracts filters from search query
func parseSearchQuery(query string) (string, map[string]string) {
	filters := make(map[string]string)
	words := strings.Fields(query)
	var plainWords []string

	for _, word := range words {
		if strings.Contains(word, ":") {
			parts := strings.SplitN(word, ":", 2)
			if len(parts) == 2 {
				key := strings.ToLower(parts[0])
				value := parts[1]
				filters[key] = value
				continue
			}
		}
		plainWords = append(plainWords, word)
	}

	plainQuery := strings.Join(plainWords, " ")
	return plainQuery, filters
}

// buildSearchQuery combines plain query with filter values for backend search
func buildSearchQuery(plainQuery string, filters map[string]string) string {
	if plainQuery != "" {
		return plainQuery
	}

	parts := []string{}
	if from := filters["from"]; from != "" {
		parts = append(parts, from)
	}
	if to := filters["to"]; to != "" {
		parts = append(parts, to)
	}
	return strings.Join(parts, " ")
}

// filterResults applies client-side filters
func filterResults(emails []types.EmailRow, filters map[string]string) []types.EmailRow {
	if len(filters) == 0 {
		return emails
	}

	var filtered []types.EmailRow
	for _, email := range emails {
		// Check is:unread filter
		if filters["is"] == "unread" && email.IsRead {
			continue
		}
		// Check is:starred filter
		if filters["is"] == "starred" && !email.IsStarred {
			continue
		}
		// Check from: filter (partial match)
		if from := filters["from"]; from != "" {
			if !strings.Contains(strings.ToLower(email.FromEmail), strings.ToLower(from)) &&
				!strings.Contains(strings.ToLower(email.From), strings.ToLower(from)) {
				continue
			}
		}
		// Check to: filter
		if to := filters["to"]; to != "" {
			// Would need recipient info in EmailRow to filter properly
			// For now, skip this filter on client side
		}

		filtered = append(filtered, email)
	}
	return filtered
}

func isQueryReady(query string) bool {
	plainQuery, filters := parseSearchQuery(query)

	if runeCount(plainQuery) >= minQueryLen {
		return true
	}

	for _, value := range filters {
		if runeCount(value) >= minQueryLen {
			return true
		}
	}

	return false
}

func runeCount(s string) int {
	return len([]rune(strings.TrimSpace(s)))
}

// Message types

// SearchResultsMsg is sent when search results are loaded
type SearchResultsMsg struct {
	Results  []types.EmailRow
	SearchID int // Used to ignore stale results from cancelled requests
}

// CloseSearchMsg is sent to close the search overlay
type CloseSearchMsg struct{}

// OpenEmailMsg is sent to open an email from search results
type OpenEmailMsg struct {
	EmailID string
}
