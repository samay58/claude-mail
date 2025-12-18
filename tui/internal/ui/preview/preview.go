package preview

import (
	"fmt"
	"html"
	"regexp"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
)

type Model struct {
	client          *data.Client
	viewport        viewport.Model // Email content viewport
	summaryViewport viewport.Model // AI summary viewport (split panel)
	renderer        *glamour.TermRenderer
	email           *types.EmailDetail
	width           int
	height          int
	focus           bool
	loading         bool
	showSummary     bool
	showRaw         bool
	showQuoted      bool
	summary         *types.SummarizeResponse
	summaryLoading  bool
	summaryError    error // Track summary loading errors
}

func New(client *data.Client) Model {
	// Email content viewport
	vp := viewport.New(0, 0)
	vp.Style = lipgloss.NewStyle().
		Padding(1).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(styles.BorderNormal)

	// AI summary viewport (for split panel)
	summaryVp := viewport.New(0, 0)
	summaryVp.Style = lipgloss.NewStyle().
		Padding(1).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(styles.Primary) // Orange border to highlight

	// Create glamour renderer for markdown
	renderer, _ := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(80),
	)

	return Model{
		client:          client,
		viewport:        vp,
		summaryViewport: summaryVp,
		renderer:        renderer,
		focus:           false,
	}
}

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h

	// Calculate available height (account for header and controls)
	availableHeight := h - 6

	if m.showSummary {
		// Split-panel layout: 30% summary (left), 70% content (right)
		summaryWidth := (w * 30) / 100
		contentWidth := w - summaryWidth - 3 // -3 for divider and spacing

		// Summary viewport (left panel)
		m.summaryViewport.Width = summaryWidth - 4  // Account for padding and borders
		m.summaryViewport.Height = availableHeight

		// Content viewport (right panel)
		m.viewport.Width = contentWidth - 4  // Account for padding and borders
		m.viewport.Height = availableHeight
	} else {
		// Full-width layout when summary is hidden
		m.viewport.Width = w - 4
		m.viewport.Height = availableHeight
	}
}

func (m *Model) SetFocus(focus bool) {
	m.focus = focus
	m.updateBorder()
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case types.EmailLoadedMsg:
		m.email = &msg.Email
		m.loading = false
		// Reset summary state when loading new email
		m.showSummary = false
		m.showRaw = false
		m.showQuoted = false
		m.summary = nil
		m.summaryLoading = false
		m.summaryError = nil
		return m, m.renderEmail()

	case renderedMsg:
		// Set email content in main viewport
		m.viewport.SetContent(msg.emailContent)
		// Set summary content in summary viewport (if showSummary is true)
		if m.showSummary {
			m.summaryViewport.SetContent(msg.summaryContent)
		}
		return m, nil

	case types.SummaryLoadedMsg:
		m.summaryLoading = false
		m.summary = &msg.Summary
		m.summaryError = nil
		// Re-render with summary
		return m, m.renderEmail()

	case types.ErrorMsg:
		// Handle summary loading errors specifically
		if m.summaryLoading {
			m.summaryLoading = false
			m.summaryError = msg.Err
			// Still re-render to show error state
			return m, m.renderEmail()
		}
		return m, nil

	case tea.KeyMsg:
		if !m.focus {
			return m, nil
		}

		switch msg.String() {
		case "s", "S":
			// Toggle summary
			m.showSummary = !m.showSummary

			// Recalculate viewport sizes for new layout
			m.SetSize(m.width, m.height)

			// Load summary if not already cached
			if m.showSummary && m.summary == nil && !m.summaryLoading {
				m.summaryLoading = true
				return m, m.loadSummary()
			}

			// Re-render to show/hide summary
			return m, m.renderEmail()

		case "v", "V":
			// Toggle raw view
			m.showRaw = !m.showRaw
			return m, m.renderEmail()

		case "q", "Q":
			// Toggle quoted text (clean view only)
			if !m.showRaw {
				m.showQuoted = !m.showQuoted
				return m, m.renderEmail()
			}

		case "r":
			// Reply
			if m.email != nil {
				return m, func() tea.Msg {
					return ReplyMsg{EmailID: m.email.ID, ReplyAll: false}
				}
			}
		case "a":
			// Reply all
			if m.email != nil {
				return m, func() tea.Msg {
					return ReplyMsg{EmailID: m.email.ID, ReplyAll: true}
				}
			}
		case "f":
			// Forward
			if m.email != nil {
				return m, func() tea.Msg {
					return ForwardMsg{EmailID: m.email.ID}
				}
			}

		// Enhanced scrolling support
		case " ", "pgdown":
			// Page down (Space or PgDn)
			m.viewport.ViewDown()
			return m, nil

		case "pgup":
			// Page up
			m.viewport.ViewUp()
			return m, nil

		case "g":
			// Jump to top (vim-style)
			m.viewport.GotoTop()
			return m, nil

		case "G":
			// Jump to bottom (vim-style)
			m.viewport.GotoBottom()
			return m, nil
		}
	}

	// Let viewport handle remaining key events (j/k, arrows, etc.)
	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

func (m Model) View() string {
	if m.loading {
		return styles.TitleStyle.Render("Loading email...")
	}

	if m.email == nil {
		return styles.SubtitleStyle.Render("Select an email to preview")
	}

	var b strings.Builder

	// Email header
	header := m.renderHeader()
	b.WriteString(header + "\n\n")

	// Email body - split panel if summary is shown, full width otherwise
	if m.showSummary {
		// Split-panel layout: summary (left) | divider | content (right)
		summaryPanel := m.summaryViewport.View()
		contentPanel := m.viewport.View()

		// Vertical divider
		dividerStyle := lipgloss.NewStyle().
			Foreground(styles.BorderNormal)
		divider := dividerStyle.Render("│")

		// Join panels horizontally
		body := lipgloss.JoinHorizontal(lipgloss.Top, summaryPanel, divider, contentPanel)
		b.WriteString(body)
	} else {
		// Full-width email content
		b.WriteString(m.viewport.View())
	}

	// Scroll position indicator
	scrollPercent := 0
	if m.viewport.TotalLineCount() > 0 {
		scrollPercent = int((float64(m.viewport.YOffset) / float64(m.viewport.TotalLineCount())) * 100)
	}
	scrollInfo := fmt.Sprintf("↓ %d%% ", scrollPercent)
	if m.viewport.AtBottom() {
		scrollInfo = "✓ Bottom "
	} else if m.viewport.AtTop() {
		scrollInfo = "↑ Top "
	}

	// Help text with scroll indicator
	helpText := fmt.Sprintf("s: AI summary • v: raw/clean • q: quoted • r: reply • a: reply all • f: forward • g/G: top/bottom • Space/PgDn: page down • %s• esc: back", scrollInfo)
	help := "\n" + styles.HelpStyle.Render(helpText)
	b.WriteString(help)

	return b.String()
}

func (m Model) renderHeader() string {
	var b strings.Builder

	// Subject with proper width handling
	maxWidth := m.width - 6 // Account for padding/borders
	if maxWidth < 20 {
		maxWidth = 20 // Minimum readable width
	}

	subjectStyle := styles.TitleStyle.Width(maxWidth)
	subject := subjectStyle.Render(m.email.Subject)
	b.WriteString(subject + "\n")

	// From/To with width constraints
	fromStyle := lipgloss.NewStyle().
		Foreground(styles.Text).
		Width(maxWidth)
	from := fromStyle.Render(fmt.Sprintf("From: %s <%s>", m.email.From, m.email.FromEmail))
	b.WriteString(from + "\n")

	toStyle := lipgloss.NewStyle().
		Foreground(styles.TextMuted).
		Width(maxWidth)
	to := toStyle.Render(fmt.Sprintf("To: %s", m.email.To))
	b.WriteString(to + "\n")

	// Date and priority (ensure it fits)
	metaStyle := lipgloss.NewStyle().
		Foreground(styles.TextMuted).
		Width(maxWidth)
	meta := metaStyle.Render(fmt.Sprintf("Date: %s • Priority: %s%d (%s)",
		m.email.Date,
		styles.PriorityIcon(m.email.PriorityCategory),
		m.email.Priority,
		m.email.PriorityCategory))
	b.WriteString(meta)

	return b.String()
}

// stripHTML removes HTML tags, CSS, and decodes HTML entities from a string
func stripHTML(input string) string {
	if input == "" {
		return ""
	}

	// Strip <script> tags with their content
	scriptRe := regexp.MustCompile(`(?i)<script[^>]*>[\s\S]*?</script>`)
	input = scriptRe.ReplaceAllString(input, "")

	// Strip <style> tags with their content (CSS blocks)
	styleRe := regexp.MustCompile(`(?i)<style[^>]*>[\s\S]*?</style>`)
	input = styleRe.ReplaceAllString(input, "")

	// Strip <head> tags entirely (often contains CSS/meta tags)
	headRe := regexp.MustCompile(`(?i)<head[^>]*>[\s\S]*?</head>`)
	input = headRe.ReplaceAllString(input, "")

	// Strip inline CSS (style="...")
	inlineCSSRe := regexp.MustCompile(`\s*style\s*=\s*["'][^"']*["']`)
	input = inlineCSSRe.ReplaceAllString(input, "")

	// Strip CSS classes (class="...")
	classRe := regexp.MustCompile(`\s*class\s*=\s*["'][^"']*["']`)
	input = classRe.ReplaceAllString(input, "")

	// Strip all remaining HTML tags
	tagRe := regexp.MustCompile(`<[^>]*>`)
	input = tagRe.ReplaceAllString(input, " ")

	// Decode HTML entities (like &nbsp; &amp; &lt; &gt; etc)
	input = html.UnescapeString(input)

	// Clean up excessive whitespace (multiple spaces → single space)
	spaceRe := regexp.MustCompile(`[ \t]+`)
	input = spaceRe.ReplaceAllString(input, " ")

	// Clean up excessive newlines (3+ newlines → 2 newlines)
	newlineRe := regexp.MustCompile(`\n\s*\n\s*\n+`)
	input = newlineRe.ReplaceAllString(input, "\n\n")

	// Remove leading/trailing whitespace from each line
	lines := strings.Split(input, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(line)
	}
	input = strings.Join(lines, "\n")

	return strings.TrimSpace(input)
}

func (m Model) renderEmail() tea.Cmd {
	return func() tea.Msg {
		var summaryContent strings.Builder
		var emailContent strings.Builder

		// Render summary content separately (for split panel)
		if m.showSummary {
			if m.summaryLoading {
				loadingStyle := lipgloss.NewStyle().
					Foreground(styles.Primary).
					Bold(true)
				summaryContent.WriteString(loadingStyle.Render("🤖 Generating AI summary..."))
				summaryContent.WriteString("\n\n")
				summaryContent.WriteString(styles.SubtitleStyle.Render("Please wait while Claude analyzes your email"))
			} else if m.summaryError != nil {
				errorStyle := lipgloss.NewStyle().
					Foreground(styles.Error)
				summaryContent.WriteString(errorStyle.Render("❌ Failed to load summary"))
				summaryContent.WriteString("\n")
				summaryContent.WriteString(styles.SubtitleStyle.Render(fmt.Sprintf("Error: %v", m.summaryError)))
			} else if m.summary != nil {
				summaryContent.WriteString(m.renderSummary())
			}
		}

		content := m.pickBodyContent()

		// Render markdown (glamour handles markdown syntax nicely)
		rendered, err := m.renderer.Render(content)
		if err != nil {
			// Fallback to plain text if markdown rendering fails
			rendered = content
		}

		emailContent.WriteString(rendered)

		return renderedMsg{
			emailContent:   emailContent.String(),
			summaryContent: summaryContent.String(),
		}
	}
}

func (m Model) pickBodyContent() string {
	if m.email == nil {
		return ""
	}

	if !m.showRaw && m.email.BodyClean != "" {
		return appendQuoted(m.email.BodyClean, m.email.BodyQuoted, m.showQuoted)
	}

	if m.showRaw && m.email.BodyText != "" {
		return stripHTML(m.email.BodyText)
	}

	if m.email.Markdown != "" {
		return stripHTML(m.email.Markdown)
	}

	if m.email.BodyHTML != "" {
		return stripHTML(m.email.BodyHTML)
	}

	return stripHTML(m.email.BodyText)
}

func appendQuoted(body string, quoted string, showQuoted bool) string {
	if !showQuoted || quoted == "" {
		return body
	}

	if body != "" {
		return body + "\n\n--- Quoted text ---\n" + quoted
	}

	return quoted
}

func (m Model) renderSummary() string {
	// Guard against nil summary
	if m.summary == nil {
		return ""
	}

	var b strings.Builder

	// Calculate content width (account for viewport padding and borders)
	// Use summaryViewport width for split panel layout
	contentWidth := m.summaryViewport.Width - 4
	if contentWidth < 30 {
		contentWidth = 30 // Minimum readable width for summary panel
	}

	// Title
	titleStyle := lipgloss.NewStyle().
		Foreground(styles.Primary).
		Bold(true).
		Width(contentWidth)
	b.WriteString(titleStyle.Render("📊 AI Summary"))
	b.WriteString("\n\n")

	// Summary text with proper wrapping
	if m.summary.Summary != "" {
		summaryStyle := lipgloss.NewStyle().
			Foreground(styles.Text).
			Italic(true).
			Width(contentWidth)
		b.WriteString(summaryStyle.Render(m.summary.Summary))
		b.WriteString("\n\n")
	}

	// Key Points with bullets
	if len(m.summary.KeyPoints) > 0 {
		sectionStyle := lipgloss.NewStyle().
			Foreground(styles.Primary).
			Bold(true).
			Width(contentWidth)
		b.WriteString(sectionStyle.Render("📌 Key Points:"))
		b.WriteString("\n")

		pointStyle := lipgloss.NewStyle().
			Foreground(styles.Text).
			Width(contentWidth - 6) // Leave room for numbering
		for i, point := range m.summary.KeyPoints {
			// Trim and skip empty points
			point = strings.TrimSpace(point)
			if point == "" {
				continue
			}
			b.WriteString(pointStyle.Render(fmt.Sprintf("  %d. %s", i+1, point)))
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}

	// Action Items with checkboxes
	if len(m.summary.ActionItems) > 0 {
		sectionStyle := lipgloss.NewStyle().
			Foreground(styles.Primary).
			Width(contentWidth).
			Bold(true)
		b.WriteString(sectionStyle.Render("✅ Action Items:"))
		b.WriteString("\n")

		actionStyle := lipgloss.NewStyle().
			Foreground(styles.Success).
			Width(contentWidth - 6) // Leave room for checkbox
		for _, item := range m.summary.ActionItems {
			// Trim and skip empty items
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			b.WriteString(actionStyle.Render(fmt.Sprintf("  ☐ %s", item)))
			b.WriteString("\n")
		}
		b.WriteString("\n")
	}

	// Sentiment with enhanced display
	if m.summary.Sentiment != "" {
		sentimentIcon := getSentimentIcon(m.summary.Sentiment)
		sectionStyle := lipgloss.NewStyle().
			Foreground(styles.Primary).
			Bold(true).
			Width(contentWidth)
		b.WriteString(sectionStyle.Render("💭 Sentiment: "))

		sentimentStyle := lipgloss.NewStyle().
			Foreground(getSentimentColor(m.summary.Sentiment)).
			Width(contentWidth - 15) // Leave room for "💭 Sentiment: "
		b.WriteString(sentimentStyle.Render(fmt.Sprintf("%s %s", sentimentIcon, strings.Title(m.summary.Sentiment))))
	}

	return b.String()
}

func getSentimentIcon(sentiment string) string {
	switch strings.ToLower(sentiment) {
	case "positive":
		return "😊"
	case "urgent", "critical":
		return "⚠️"
	case "negative", "angry":
		return "😟"
	case "neutral", "informational":
		return "ℹ️"
	default:
		return "📧"
	}
}

func getSentimentColor(sentiment string) lipgloss.Color {
	switch strings.ToLower(sentiment) {
	case "positive":
		return styles.Success
	case "urgent", "critical":
		return styles.Error
	case "negative", "angry":
		return styles.Warning
	case "neutral", "informational":
		return styles.Text
	default:
		return styles.TextMuted
	}
}

func (m *Model) updateBorder() {
	if m.focus {
		m.viewport.Style = m.viewport.Style.BorderForeground(styles.BorderFocus)
	} else {
		m.viewport.Style = m.viewport.Style.BorderForeground(styles.BorderNormal)
	}
}

// Load triggers loading of an email by ID
func (m *Model) Load(emailID string) tea.Cmd {
	m.loading = true
	m.email = nil

	return func() tea.Msg {
		email, err := m.client.GetEmail(emailID)
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.EmailLoadedMsg{Email: *email}
	}
}

// loadSummary triggers loading AI summary for the current email
func (m *Model) loadSummary() tea.Cmd {
	if m.email == nil {
		return nil
	}

	emailID := m.email.ID
	return func() tea.Msg {
		summary, err := m.client.GetSummary(emailID)
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.SummaryLoadedMsg{Summary: *summary}
	}
}

// HasEmail returns true if an email is loaded
func (m Model) HasEmail() bool {
	return m.email != nil
}

// CurrentEmailID returns the ID of the currently loaded email
func (m Model) CurrentEmailID() string {
	if m.email == nil {
		return ""
	}
	return m.email.ID
}

type renderedMsg struct {
	emailContent   string
	summaryContent string
}

// Message types
type (
	ReplyMsg struct {
		EmailID  string
		ReplyAll bool
	}

	ForwardMsg struct {
		EmailID string
	}
)
