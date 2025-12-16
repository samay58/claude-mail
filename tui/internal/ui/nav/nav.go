package nav

import (
	"fmt"
	"io"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
)

// ViewType represents different email views
type ViewType string

const (
	ViewInbox      ViewType = "inbox"
	ViewStarred    ViewType = "starred"
	ViewSent       ViewType = "sent"
	ViewDrafts     ViewType = "drafts"
	ViewAllMail    ViewType = "all"
	BundleUrgent   ViewType = "urgent"
	BundleImportant ViewType = "important"
	BundleNeedsReply ViewType = "needs_reply"
	BundleCalendar ViewType = "calendar"
	BundleNewsletter ViewType = "newsletter"
)

// ViewItem represents a navigation item
type ViewItem struct {
	Type     ViewType
	Icon     string
	Label    string
	Shortcut string
	Count    int
	IsBundle bool // Smart bundles vs standard views
}

func (i ViewItem) FilterValue() string { return i.Label }

type itemDelegate struct {
	selected int
}

func (d itemDelegate) Height() int                               { return 1 }
func (d itemDelegate) Spacing() int                              { return 0 }
func (d itemDelegate) Update(msg tea.Msg, m *list.Model) tea.Cmd { return nil }
func (d itemDelegate) Render(w io.Writer, m list.Model, index int, item list.Item) {
	viewItem, ok := item.(ViewItem)
	if !ok {
		return
	}

	// Build the display string
	count := ""
	if viewItem.Count > 0 {
		count = lipgloss.NewStyle().
			Foreground(styles.TextMuted).
			Render(fmt.Sprintf(" (%d)", viewItem.Count))
	}

	// Icon + Label + Count
	text := fmt.Sprintf("%s %s %s%s",
		viewItem.Shortcut,
		viewItem.Icon,
		viewItem.Label,
		count,
	)

	// Style based on selection
	style := lipgloss.NewStyle().
		Foreground(styles.Text).
		Padding(0, 1)

	if index == d.selected {
		style = style.
			Background(styles.Primary).
			Foreground(lipgloss.Color("#FFFFFF")).
			Bold(true)
	}

	fmt.Fprint(w, style.Render(text))
}

type Model struct {
	client       *data.Client
	list         list.Model
	items        []ViewItem
	selectedView ViewType
	width        int
	height       int
	focus        bool
}

func New(client *data.Client) Model {
	// Create standard views
	standardViews := []ViewItem{
		{Type: ViewInbox, Icon: "📥", Label: "Inbox", Shortcut: "1", Count: 0},
		{Type: ViewStarred, Icon: "⭐", Label: "Starred", Shortcut: "2", Count: 0},
		{Type: ViewSent, Icon: "📤", Label: "Sent", Shortcut: "3", Count: 0},
		{Type: ViewDrafts, Icon: "📝", Label: "Drafts", Shortcut: "4", Count: 0},
		{Type: ViewAllMail, Icon: "📧", Label: "All Mail", Shortcut: "5", Count: 0},
	}

	// Create smart bundles
	smartBundles := []ViewItem{
		{Type: BundleUrgent, Icon: "🔴", Label: "Urgent", Shortcut: "6", Count: 0, IsBundle: true},
		{Type: BundleImportant, Icon: "🟠", Label: "Important", Shortcut: "7", Count: 0, IsBundle: true},
		{Type: BundleNeedsReply, Icon: "💬", Label: "Needs Reply", Shortcut: "8", Count: 0, IsBundle: true},
		{Type: BundleCalendar, Icon: "📅", Label: "Calendar", Shortcut: "9", Count: 0, IsBundle: true},
		{Type: BundleNewsletter, Icon: "📰", Label: "Newsletter", Shortcut: "0", Count: 0, IsBundle: true},
	}

	// Combine all items
	allItems := append(standardViews, smartBundles...)
	items := make([]list.Item, len(allItems))
	for i, v := range allItems {
		items[i] = v
	}

	// Create list
	delegate := itemDelegate{selected: 0}
	l := list.New(items, delegate, 0, 0)
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(false)
	l.SetShowHelp(false)
	l.SetShowTitle(false)
	l.SetShowPagination(false)

	// Custom styles
	l.Styles.Title = lipgloss.NewStyle()
	l.Styles.NoItems = lipgloss.NewStyle().Foreground(styles.TextMuted)

	return Model{
		client:       client,
		list:         l,
		items:        allItems,
		selectedView: ViewInbox,
		focus:        false,
	}
}

func (m Model) Init() tea.Cmd {
	return m.updateCounts()
}

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
	m.list.SetSize(w, h-4) // Leave room for header/footer
}

func (m *Model) SetFocus(focus bool) {
	m.focus = focus
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case types.StatsLoadedMsg:
		// Update counts from stats
		m.updateCountsFromStats(msg.Stats)
		return m, nil

	case types.BundleCountsMsg:
		// Update smart bundle counts
		m.updateBundleCounts(msg.Counts)
		return m, nil

	case tea.KeyMsg:
		if !m.focus {
			// Number keys work globally
			switch msg.String() {
			case "1", "2", "3", "4", "5", "6", "7", "8", "9", "0":
				return m.handleNumberKey(msg.String())
			}
			return m, nil
		}

		switch msg.String() {
		case "1", "2", "3", "4", "5", "6", "7", "8", "9", "0":
			return m.handleNumberKey(msg.String())

		case "enter":
			// Select current view
			if i, ok := m.list.SelectedItem().(ViewItem); ok {
				m.selectedView = i.Type
				return m, func() tea.Msg {
					return ViewSelectedMsg{View: i.Type}
				}
			}

		case "up", "k":
			m.list.CursorUp()
		case "down", "j":
			m.list.CursorDown()
		}
	}

	// Update delegate with current selection
	m.list.SetDelegate(itemDelegate{selected: m.list.Index()})
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

func (m Model) View() string {
	if m.width < 15 {
		// Too narrow, show icons only
		return m.renderCompact()
	}

	var b strings.Builder

	// Header
	title := styles.TitleStyle.Render("Views")
	b.WriteString(title + "\n")

	// Divider after standard views (before smart bundles)
	listView := m.list.View()
	lines := strings.Split(listView, "\n")

	for i, line := range lines {
		if i == 5 && len(lines) > 5 {
			// Add divider before smart bundles
			divider := lipgloss.NewStyle().
				Foreground(styles.BorderNormal).
				Render(strings.Repeat("─", m.width-2))
			b.WriteString(divider + "\n")

			bundleHeader := lipgloss.NewStyle().
				Foreground(styles.TextMuted).
				Padding(0, 1).
				Render("Smart Bundles")
			b.WriteString(bundleHeader + "\n")
		}
		b.WriteString(line)
		if i < len(lines)-1 {
			b.WriteString("\n")
		}
	}

	// Footer hint
	if m.focus {
		hint := styles.HelpStyle.Render("↑↓: navigate • enter: select")
		b.WriteString("\n" + hint)
	}

	// Border
	borderStyle := styles.BorderStyle
	if m.focus {
		borderStyle = styles.FocusedBorderStyle
	}

	return borderStyle.Width(m.width - 2).Render(b.String())
}

func (m Model) renderCompact() string {
	// Icon-only view for narrow terminals
	var icons []string
	for i, item := range m.items {
		style := lipgloss.NewStyle()
		if i == m.list.Index() {
			style = style.Background(styles.Primary)
		}
		icons = append(icons, style.Render(item.Icon))
	}
	return lipgloss.JoinVertical(lipgloss.Left, icons...)
}

func (m *Model) handleNumberKey(key string) (Model, tea.Cmd) {
	// Map number to index
	index := -1
	switch key {
	case "1":
		index = 0
	case "2":
		index = 1
	case "3":
		index = 2
	case "4":
		index = 3
	case "5":
		index = 4
	case "6":
		index = 5
	case "7":
		index = 6
	case "8":
		index = 7
	case "9":
		index = 8
	case "0":
		index = 9
	}

	if index >= 0 && index < len(m.items) {
		m.list.Select(index)
		m.selectedView = m.items[index].Type
		return *m, func() tea.Msg {
			return ViewSelectedMsg{View: m.items[index].Type}
		}
	}

	return *m, nil
}

func (m *Model) updateCountsFromStats(stats types.Stats) {
	// Update standard view counts
	for i := range m.items {
		switch m.items[i].Type {
		case ViewInbox:
			m.items[i].Count = stats.Unread
		case ViewAllMail:
			m.items[i].Count = stats.Emails
		}
	}
	m.refreshList()
}

func (m *Model) updateBundleCounts(counts map[string]int) {
	// Update smart bundle counts
	for i := range m.items {
		if m.items[i].IsBundle {
			if count, ok := counts[string(m.items[i].Type)]; ok {
				m.items[i].Count = count
			}
		}
	}
	m.refreshList()
}

func (m *Model) refreshList() {
	items := make([]list.Item, len(m.items))
	for i, v := range m.items {
		items[i] = v
	}
	m.list.SetItems(items)
}

func (m Model) updateCounts() tea.Cmd {
	return tea.Batch(
		func() tea.Msg {
			stats, err := m.client.GetStats()
			if err != nil {
				return types.ErrorMsg{Err: err}
			}
			return types.StatsLoadedMsg{Stats: *stats}
		},
		func() tea.Msg {
			// TODO: Implement bundle counts endpoint
			// For now, return mock data
			return types.BundleCountsMsg{
				Counts: map[string]int{
					"urgent":        5,
					"important":     12,
					"needs_reply":   8,
					"calendar":      4,
					"newsletter":    45,
				},
			}
		},
	)
}

// SelectedView returns the currently selected view
func (m Model) SelectedView() ViewType {
	return m.selectedView
}

// ViewSelectedMsg is sent when a view is selected
type ViewSelectedMsg struct {
	View ViewType
}
