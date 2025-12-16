package search

import (
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

// Model represents the search overlay
type Model struct {
	client      *data.Client
	searchInput textinput.Model
	table       table.Model
	results     []types.EmailRow
	history     []string
	historyIdx  int
	searching   bool
	lastQuery   string
	lastSearch  time.Time
	width       int
	height      int
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
			// Open selected email or search if in input
			if m.table.Focused() && len(m.results) > 0 {
				selected := m.table.Cursor()
				if selected < len(m.results) {
					email := m.results[selected]
					return m, func() tea.Msg {
						return OpenEmailMsg{EmailID: email.ID}
					}
				}
			} else {
				// Execute search
				query := m.searchInput.Value()
				if query != "" {
					return m, m.performSearch(query)
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
			// If input is empty, navigate history
			if !m.table.Focused() && m.searchInput.Value() == "" {
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
			m.updateTableRows()
			m.searchInput.Focus()
			m.table.Blur()
			return m, nil
		}

	case SearchResultsMsg:
		m.searching = false
		m.results = msg.Results
		m.updateTableRows()

		// Add to history if not empty and different from last
		query := m.lastQuery
		if query != "" && (len(m.history) == 0 || m.history[0] != query) {
			m.history = append([]string{query}, m.history...)
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

	// Auto-search as user types (debounced)
	if !m.table.Focused() {
		oldValue := m.searchInput.Value()
		var cmd tea.Cmd
		m.searchInput, cmd = m.searchInput.Update(msg)
		cmds = append(cmds, cmd)

		newValue := m.searchInput.Value()
		if newValue != oldValue && newValue != m.lastQuery {
			// Debounce: only search if 300ms passed since last keystroke
			if time.Since(m.lastSearch) > 300*time.Millisecond {
				cmds = append(cmds, m.performSearch(newValue))
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
			Render("🔄 Searching...")
		b.WriteString(status)
		b.WriteString("\n\n")
	} else if len(m.results) > 0 {
		status := lipgloss.NewStyle().
			Foreground(styles.Success).
			Render(fmt.Sprintf("✓ Found %d results", len(m.results)))
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
	keys := styles.HelpStyle.Render("enter: search/open • tab: switch • ↑/↓: navigate/history • ctrl+l: clear • esc: close")
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

func (m Model) performSearch(query string) tea.Cmd {
	m.lastQuery = query
	m.lastSearch = time.Now()
	m.searching = true

	return func() tea.Msg {
		// Parse search query for filters
		parsedQuery, filters := parseSearchQuery(query)

		// Build API query
		apiQuery := parsedQuery

		// Add filters to query (basic implementation)
		// In a full implementation, these would be separate API parameters
		if filters["from"] != "" {
			apiQuery = filters["from"]
		}
		if filters["to"] != "" {
			apiQuery = filters["to"]
		}

		// Fetch results
		emails, err := m.client.ListEmails(0, 50, apiQuery)
		if err != nil {
			return types.ErrorMsg{Err: err}
		}

		// Apply client-side filters
		filtered := filterResults(emails, filters)

		return SearchResultsMsg{Results: filtered}
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
		// Check from: filter
		if filters["from"] != "" && !strings.Contains(strings.ToLower(email.FromEmail), strings.ToLower(filters["from"])) {
			continue
		}

		filtered = append(filtered, email)
	}
	return filtered
}

// Message types

// SearchResultsMsg is sent when search results are loaded
type SearchResultsMsg struct {
	Results []types.EmailRow
}

// CloseSearchMsg is sent to close the search overlay
type CloseSearchMsg struct{}

// OpenEmailMsg is sent to open an email from search results
type OpenEmailMsg struct {
	EmailID string
}
