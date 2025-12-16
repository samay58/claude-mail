package quickreply

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
)

// Model represents the quick reply bar component
type Model struct {
	client    *data.Client
	emailID   string
	replies   []string
	loading   bool
	sending   bool  // Track sending state
	sentIndex int   // Track which reply was sent
	err       error
	focused   bool
	width     int
	height    int
}

// New creates a new quick reply bar
func New(client *data.Client) Model {
	return Model{
		client:  client,
		replies: []string{},
		loading: false,
		focused: false,
		width:   80,
		height:  10,
	}
}

// Init initializes the component
func (m Model) Init() tea.Cmd {
	return nil
}

// Load triggers loading quick replies for an email
func (m *Model) Load(emailID string) tea.Cmd {
	m.emailID = emailID
	m.loading = true
	m.err = nil
	m.replies = []string{}

	return func() tea.Msg {
		replies, err := m.client.GetQuickReplies(emailID)
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.QuickRepliesLoadedMsg{Replies: replies}
	}
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if !m.focused || m.loading || m.sending {
			return m, nil
		}

		switch msg.String() {
		case "1":
			if len(m.replies) > 0 {
				m.sending = true
				m.sentIndex = 0
				return m, m.sendReply(m.replies[0])
			}

		case "2":
			if len(m.replies) > 1 {
				m.sending = true
				m.sentIndex = 1
				return m, m.sendReply(m.replies[1])
			}

		case "3":
			if len(m.replies) > 2 {
				m.sending = true
				m.sentIndex = 2
				return m, m.sendReply(m.replies[2])
			}
		}

	case types.QuickRepliesLoadedMsg:
		m.loading = false
		m.replies = msg.Replies
		return m, nil

	case types.ErrorMsg:
		m.loading = false
		m.sending = false
		m.err = msg.Err
		return m, nil

	case types.EmailSentMsg:
		m.sending = false
		if msg.Success {
			// Clear the sent reply from the list for better UX
			m.replies[m.sentIndex] = "✅ Sent!"
		}
		return m, nil
	}

	return m, nil
}

// sendReply sends a quick reply
func (m Model) sendReply(body string) tea.Cmd {
	return func() tea.Msg {
		err := m.client.SendReply(types.ReplyRequest{
			EmailID:  m.emailID,
			Body:     body,
			ReplyAll: false,
		})
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.EmailSentMsg{Success: true}
	}
}

// View renders the component
func (m Model) View() string {
	if !m.focused {
		return ""
	}

	// Border always uses primary color since we only render when focused
	borderColor := styles.Primary

	boxStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Padding(0, 1).
		Width(m.width - 2)

	// Title
	title := styles.TitleStyle.Render("💬 Quick Replies")

	// Content
	var content string
	if m.loading {
		content = styles.SubtitleStyle.Render("🤖 Loading quick replies...")
	} else if m.sending {
		content = styles.SubtitleStyle.Render(fmt.Sprintf("📤 Sending reply %d...", m.sentIndex+1))
	} else if m.err != nil {
		content = lipgloss.NewStyle().
			Foreground(styles.Error).
			Render(fmt.Sprintf("Error: %v", m.err))
	} else if len(m.replies) == 0 {
		content = styles.SubtitleStyle.Render("No quick replies available")
	} else {
		// Render replies with key indicators
		var replyLines []string
		for i, reply := range m.replies {
			if i >= 3 {
				break // Only show first 3
			}

			keyStyle := lipgloss.NewStyle().
				Foreground(styles.Primary).
				Bold(true)

			textStyle := lipgloss.NewStyle().
				Foreground(styles.Text)

			// Wrap text to fit width
			maxWidth := m.width - 12 // Account for padding, borders, and key
			wrappedText := wrapText(reply, maxWidth)

			key := keyStyle.Render(fmt.Sprintf("[%d]", i+1))
			text := textStyle.Render(wrappedText)

			replyLines = append(replyLines, fmt.Sprintf("%s %s", key, text))

			// Add spacing between replies
			if i < len(m.replies)-1 && i < 2 {
				replyLines = append(replyLines, "")
			}
		}
		content = strings.Join(replyLines, "\n")
	}

	body := lipgloss.JoinVertical(lipgloss.Left, title, "", content)
	return boxStyle.Render(body)
}

// SetFocus sets the focus state
func (m *Model) SetFocus(focused bool) {
	m.focused = focused
}

// SetSize sets the component size
func (m *Model) SetSize(width, height int) {
	m.width = width
	m.height = height
}

// HasReplies returns true if there are quick replies loaded
func (m Model) HasReplies() bool {
	return len(m.replies) > 0
}

// wrapText wraps text to fit within a given width
func wrapText(text string, width int) string {
	if len(text) <= width {
		return text
	}

	words := strings.Fields(text)
	var lines []string
	var currentLine string

	for _, word := range words {
		testLine := currentLine
		if testLine != "" {
			testLine += " "
		}
		testLine += word

		if len(testLine) > width {
			if currentLine != "" {
				lines = append(lines, currentLine)
				currentLine = word
			} else {
				// Single word is too long, force break
				lines = append(lines, testLine[:width])
				currentLine = testLine[width:]
			}
		} else {
			currentLine = testLine
		}
	}

	if currentLine != "" {
		lines = append(lines, currentLine)
	}

	return strings.Join(lines, "\n    ") // Indent wrapped lines
}
