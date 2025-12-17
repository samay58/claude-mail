package help

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/styles"
)

// Model represents the help overlay
type Model struct {
	width        int
	height       int
	scrollOffset int
}

// New creates a new help model
func New() Model {
	return Model{
		scrollOffset: 0,
	}
}

// Init initializes the help component
func (m Model) Init() tea.Cmd {
	return nil
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "?", "esc", "q":
			// Close help overlay
			return m, func() tea.Msg {
				return CloseHelpMsg{}
			}

		case "up", "k":
			if m.scrollOffset > 0 {
				m.scrollOffset--
			}

		case "down", "j":
			// Allow scrolling down (max will be limited in View)
			m.scrollOffset++

		case "home", "g":
			m.scrollOffset = 0

		case "end", "G":
			m.scrollOffset = 100 // Will be clamped in View
		}
	}

	return m, nil
}

// View renders the help overlay
func (m Model) View() string {
	var b strings.Builder

	// Title
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(styles.Primary).
		Padding(0, 2)
	title := titleStyle.Render("⌨️  Keyboard Shortcuts")
	b.WriteString(title)
	b.WriteString("\n\n")

	// Content sections
	sections := []helpSection{
		{
			title: "Navigation",
			shortcuts: []shortcut{
				{"j / ↓", "Move down"},
				{"k / ↑", "Move up"},
				{"g", "Go to top"},
				{"G", "Go to bottom"},
				{"Space / PgDn", "Page down"},
				{"PgUp", "Page up"},
				{"Tab", "Switch panes"},
				{"Enter", "Open selected email"},
				{"Esc", "Go back / Close overlay"},
				{"1-9, 0", "Switch to view (1=Inbox, 2=Starred, etc.)"},
			},
		},
		{
			title: "Email Actions",
			shortcuts: []shortcut{
				{"s", "Sync emails from server"},
				{"c", "Compose new email"},
				{"r", "Reply to email"},
				{"a", "Reply all"},
				{"f", "Forward email"},
				{"t", "Toggle star"},
				{"m", "Toggle read/unread"},
			},
		},
		{
			title: "Batch Operations",
			shortcuts: []shortcut{
				{"x", "Toggle select mode"},
				{"Space", "Toggle selection (in select mode)"},
				{"a", "Select all visible (in select mode)"},
				{"n", "Select none (in select mode)"},
				{"i", "Invert selection (in select mode)"},
				{"r", "Mark selected as read"},
				{"u", "Mark selected as unread"},
				{"s", "Star selected emails"},
				{"d", "Delete selected (with confirmation)"},
				{"e", "Archive selected"},
			},
		},
		{
			title: "AI Features",
			shortcuts: []shortcut{
				{"s", "Toggle AI summary (in detail view)"},
				{"Alt+G", "Cycle AI draft suggestions (in composer)"},
				{"1", "Send quick reply #1 (in detail view)"},
				{"2", "Send quick reply #2 (in detail view)"},
				{"3", "Send quick reply #3 (in detail view)"},
			},
		},
		{
			title: "Search",
			shortcuts: []shortcut{
				{"/", "Open search overlay"},
				{"Ctrl+L", "Clear search (in search)"},
				{"↑/↓", "Navigate search history (when input empty)"},
			},
		},
		{
			title: "Search Filters",
			shortcuts: []shortcut{
				{"from:user@example.com", "Search by sender"},
				{"to:user@example.com", "Search by recipient"},
				{"is:unread", "Show only unread emails"},
				{"is:starred", "Show only starred emails"},
			},
		},
		{
			title: "System",
			shortcuts: []shortcut{
				{"?", "Show this help"},
				{"X", "Clear all emails (with confirmation)"},
				{"q", "Quit application"},
				{"Ctrl+C", "Force quit"},
			},
		},
	}

	// Render sections with scrolling
	maxLines := m.height - 8 // Account for title and footer
	currentLine := 0
	visibleLines := 0

	for _, section := range sections {
		// Section title
		if currentLine >= m.scrollOffset && visibleLines < maxLines {
			sectionTitle := lipgloss.NewStyle().
				Bold(true).
				Foreground(styles.Primary).
				Padding(0, 2).
				Render("▸ " + section.title)
			b.WriteString(sectionTitle)
			b.WriteString("\n")
			visibleLines++
		}
		currentLine++

		// Shortcuts
		for _, sc := range section.shortcuts {
			if currentLine >= m.scrollOffset && visibleLines < maxLines {
				keyStyle := lipgloss.NewStyle().
					Foreground(styles.Primary).
					Bold(true).
					Width(30).
					Padding(0, 2)

				descStyle := lipgloss.NewStyle().
					Foreground(styles.Text)

				line := keyStyle.Render(sc.key) + descStyle.Render(sc.description)
				b.WriteString(line)
				b.WriteString("\n")
				visibleLines++
			}
			currentLine++
		}

		// Add spacing between sections
		if currentLine >= m.scrollOffset && visibleLines < maxLines {
			b.WriteString("\n")
			visibleLines++
		}
		currentLine++
	}

	// Scroll indicator
	if currentLine > maxLines {
		scrollHelp := lipgloss.NewStyle().
			Foreground(styles.TextMuted).
			Padding(1, 2).
			Render("↑/↓ or j/k to scroll • ? or ESC to close")
		b.WriteString("\n")
		b.WriteString(scrollHelp)
	} else {
		closeHelp := styles.HelpStyle.Render("Press ? or ESC to close")
		b.WriteString("\n")
		b.WriteString(closeHelp)
	}

	// Border around everything
	borderStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(styles.Primary).
		Padding(1, 2).
		Width(m.width - 4)

	return borderStyle.Render(b.String())
}

// SetSize sets the component size
func (m *Model) SetSize(width, height int) {
	m.width = width
	m.height = height
}

// Helper types

type helpSection struct {
	title     string
	shortcuts []shortcut
}

type shortcut struct {
	key         string
	description string
}

// Message types

// CloseHelpMsg is sent to close the help overlay
type CloseHelpMsg struct{}
