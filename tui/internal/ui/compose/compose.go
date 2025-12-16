package compose

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
)

// FieldType represents which field is focused
type FieldType int

const (
	ToField FieldType = iota
	CcField
	BccField
	SubjectField
	BodyField
)

// ComposeMode represents the composition context
type ComposeMode string

const (
	ModeCompose   ComposeMode = "compose"
	ModeReply     ComposeMode = "reply"
	ModeReplyAll  ComposeMode = "replyAll"
	ModeForward   ComposeMode = "forward"
)

// Model represents the email composer component
type Model struct {
	client *data.Client

	// Form fields
	to      textinput.Model
	cc      textinput.Model
	bcc     textinput.Model
	subject textinput.Model
	body    textarea.Model

	// State
	mode          ComposeMode
	originalID    string
	originalEmail *types.EmailDetail  // Store full original email for threading
	focused       FieldType
	aiSuggestions []string
	currentSuggestion int
	loadingSuggestions bool
	sending       bool  // Show sending state

	// UI
	width  int
	height int
	err    error
}

// New creates a new composer
func New(client *data.Client) Model {
	// Initialize text inputs
	to := textinput.New()
	to.Placeholder = "recipient@example.com"
	to.CharLimit = 200

	cc := textinput.New()
	cc.Placeholder = "cc@example.com (optional)"
	cc.CharLimit = 200

	bcc := textinput.New()
	bcc.Placeholder = "bcc@example.com (optional)"
	bcc.CharLimit = 200

	subject := textinput.New()
	subject.Placeholder = "Email subject"
	subject.CharLimit = 300

	// Initialize textarea
	body := textarea.New()
	body.Placeholder = "Type your message here...\nPress Alt+G for AI suggestions"
	body.CharLimit = 10000
	body.ShowLineNumbers = false

	return Model{
		client:  client,
		to:      to,
		cc:      cc,
		bcc:     bcc,
		subject: subject,
		body:    body,
		mode:    ModeCompose,
		focused: ToField,
		width:   80,
		height:  30,
	}
}

// Init initializes the component
func (m Model) Init() tea.Cmd {
	return nil
}

// SetMode configures the composer for a specific mode
func (m *Model) SetMode(mode ComposeMode, originalID string, originalEmail *types.EmailDetail) tea.Cmd {
	m.mode = mode
	m.originalID = originalID
	m.originalEmail = originalEmail  // Store for threading headers

	// Reset fields
	m.to.SetValue("")
	m.cc.SetValue("")
	m.bcc.SetValue("")
	m.subject.SetValue("")
	m.body.SetValue("")
	m.aiSuggestions = []string{}
	m.currentSuggestion = 0

	// Pre-fill based on mode
	if originalEmail != nil {
		switch mode {
		case ModeReply:
			m.to.SetValue(originalEmail.FromEmail)
			if strings.HasPrefix(originalEmail.Subject, "Re: ") {
				m.subject.SetValue(originalEmail.Subject)
			} else {
				m.subject.SetValue("Re: " + originalEmail.Subject)
			}
			// Quote original email with '>' prefix
			quotedBody := quoteEmail(originalEmail.From, originalEmail.Date, originalEmail.BodyText)
			m.body.SetValue("\n\n" + quotedBody)

		case ModeReplyAll:
			m.to.SetValue(originalEmail.FromEmail)
			m.cc.SetValue(originalEmail.To)
			if strings.HasPrefix(originalEmail.Subject, "Re: ") {
				m.subject.SetValue(originalEmail.Subject)
			} else {
				m.subject.SetValue("Re: " + originalEmail.Subject)
			}
			// Quote original email with '>' prefix
			quotedBody := quoteEmail(originalEmail.From, originalEmail.Date, originalEmail.BodyText)
			m.body.SetValue("\n\n" + quotedBody)

		case ModeForward:
			if strings.HasPrefix(originalEmail.Subject, "Fwd: ") {
				m.subject.SetValue(originalEmail.Subject)
			} else {
				m.subject.SetValue("Fwd: " + originalEmail.Subject)
			}
			// Pre-fill body with original email (no quoting for forwards)
			m.body.SetValue(fmt.Sprintf("\n\n---------- Forwarded message ---------\nFrom: %s\nDate: %s\nSubject: %s\n\n%s",
				originalEmail.From, originalEmail.Date, originalEmail.Subject, originalEmail.BodyText))
		}
	}

	// Focus first empty field
	m.focused = m.getFirstEmptyField()
	m.updateFocus()

	// Load AI suggestions for replies
	if mode == ModeReply || mode == ModeReplyAll {
		return m.loadAISuggestions()
	}

	return nil
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "tab":
			m.nextField()
			m.updateFocus()
			return m, nil

		case "shift+tab":
			m.prevField()
			m.updateFocus()
			return m, nil

		case "ctrl+s":
			// Send email (with loading state)
			if !m.sending {
				m.sending = true
				return m, m.sendEmail()
			}
			return m, nil

		case "esc":
			// Cancel composition
			return m, func() tea.Msg {
				return CancelMsg{}
			}

		case "alt+g":
			// Generate/cycle AI suggestions (only for body field)
			if m.focused == BodyField {
				if !m.loadingSuggestions && len(m.aiSuggestions) == 0 {
					// Load suggestions
					m.loadingSuggestions = true
					return m, m.loadAISuggestions()
				} else if len(m.aiSuggestions) > 0 {
					// Cycle to next suggestion
					m.currentSuggestion = (m.currentSuggestion + 1) % len(m.aiSuggestions)
					m.body.SetValue(m.aiSuggestions[m.currentSuggestion])
					return m, nil
				}
			}
			return m, nil
		}

	case types.DraftSuggestionsLoadedMsg:
		m.loadingSuggestions = false
		m.aiSuggestions = msg.Suggestions
		if len(msg.Suggestions) > 0 {
			m.body.SetValue(msg.Suggestions[0])
			m.currentSuggestion = 0
		}
		return m, nil

	case types.EmailSentMsg:
		m.sending = false  // Clear sending state
		if msg.Success {
			return m, func() tea.Msg {
				return SentSuccessMsg{}
			}
		}

	case types.ErrorMsg:
		m.err = msg.Err
		m.sending = false  // Clear sending state on error
		return m, nil
	}

	// Route input to focused field
	var cmd tea.Cmd
	switch m.focused {
	case ToField:
		m.to, cmd = m.to.Update(msg)
	case CcField:
		m.cc, cmd = m.cc.Update(msg)
	case BccField:
		m.bcc, cmd = m.bcc.Update(msg)
	case SubjectField:
		m.subject, cmd = m.subject.Update(msg)
	case BodyField:
		m.body, cmd = m.body.Update(msg)
	}
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

// View renders the component
func (m Model) View() string {
	var b strings.Builder

	// Title
	title := m.getModeTitle()
	b.WriteString(styles.TitleStyle.Render(title))
	b.WriteString("\n\n")

	// Fields
	b.WriteString(m.renderField("To:", m.to, m.focused == ToField))
	b.WriteString("\n")
	b.WriteString(m.renderField("Cc:", m.cc, m.focused == CcField))
	b.WriteString("\n")
	b.WriteString(m.renderField("Bcc:", m.bcc, m.focused == BccField))
	b.WriteString("\n")
	b.WriteString(m.renderField("Subject:", m.subject, m.focused == SubjectField))
	b.WriteString("\n\n")

	// Separator
	separator := lipgloss.NewStyle().
		Foreground(styles.BorderNormal).
		Render(strings.Repeat("─", m.width-4))
	b.WriteString(separator)
	b.WriteString("\n\n")

	// Body field
	b.WriteString(m.body.View())
	b.WriteString("\n\n")

	// Word count, sending status, and AI status
	wordCount := len(strings.Fields(m.body.Value()))
	statusText := fmt.Sprintf("%d words", wordCount)

	if m.sending {
		statusText += " • 📤 Sending email..."
	} else if m.loadingSuggestions {
		statusText += " • 🤖 Loading AI suggestions..."
	} else if len(m.aiSuggestions) > 0 {
		statusText += fmt.Sprintf(" • AI suggestion %d of %d (Alt+G to cycle)", m.currentSuggestion+1, len(m.aiSuggestions))
	}
	b.WriteString(styles.SubtitleStyle.Render(statusText))
	b.WriteString("\n\n")

	// Error message
	if m.err != nil {
		errMsg := lipgloss.NewStyle().
			Foreground(styles.Error).
			Render(fmt.Sprintf("Error: %v", m.err))
		b.WriteString(errMsg)
		b.WriteString("\n\n")
	}

	// Help text
	help := styles.HelpStyle.Render("tab: next field • ctrl+s: send • alt+g: AI suggestions • esc: cancel")
	b.WriteString(help)

	return b.String()
}

// SetSize sets the component size
func (m *Model) SetSize(width, height int) {
	m.width = width
	m.height = height

	// Update body textarea size
	m.body.SetWidth(width - 4)
	m.body.SetHeight(height - 20) // Account for header, fields, and footer
}

// Helper methods

func (m Model) getModeTitle() string {
	switch m.mode {
	case ModeReply:
		return "✍️  Reply"
	case ModeReplyAll:
		return "✍️  Reply All"
	case ModeForward:
		return "✍️  Forward"
	default:
		return "✍️  Compose Email"
	}
}

func (m Model) renderField(label string, field textinput.Model, focused bool) string {
	labelStyle := lipgloss.NewStyle().
		Foreground(styles.TextMuted).
		Width(10)

	fieldStyle := lipgloss.NewStyle()
	if focused {
		fieldStyle = fieldStyle.Foreground(styles.Primary).Bold(true)
	} else {
		fieldStyle = fieldStyle.Foreground(styles.Text)
	}

	return labelStyle.Render(label) + " " + fieldStyle.Render(field.View())
}

func (m *Model) nextField() {
	switch m.focused {
	case ToField:
		m.focused = CcField
	case CcField:
		m.focused = BccField
	case BccField:
		m.focused = SubjectField
	case SubjectField:
		m.focused = BodyField
	case BodyField:
		m.focused = ToField
	}
}

func (m *Model) prevField() {
	switch m.focused {
	case ToField:
		m.focused = BodyField
	case CcField:
		m.focused = ToField
	case BccField:
		m.focused = CcField
	case SubjectField:
		m.focused = BccField
	case BodyField:
		m.focused = SubjectField
	}
}

func (m *Model) updateFocus() {
	// Focus the current field
	m.to.Blur()
	m.cc.Blur()
	m.bcc.Blur()
	m.subject.Blur()
	m.body.Blur()

	switch m.focused {
	case ToField:
		m.to.Focus()
	case CcField:
		m.cc.Focus()
	case BccField:
		m.bcc.Focus()
	case SubjectField:
		m.subject.Focus()
	case BodyField:
		m.body.Focus()
	}
}

func (m Model) getFirstEmptyField() FieldType {
	if m.to.Value() == "" {
		return ToField
	}
	if m.subject.Value() == "" {
		return SubjectField
	}
	return BodyField
}

func (m Model) validate() error {
	// Check To field
	toValue := strings.TrimSpace(m.to.Value())
	if toValue == "" {
		return fmt.Errorf("📧 To field is required")
	}

	// Validate email format
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	emails := strings.Split(toValue, ",")
	for _, email := range emails {
		email = strings.TrimSpace(email)
		if !emailRegex.MatchString(email) {
			return fmt.Errorf("❌ Invalid email address: %s", email)
		}
	}

	// Check Subject field
	if strings.TrimSpace(m.subject.Value()) == "" {
		return fmt.Errorf("📝 Subject field is required")
	}

	// Check Body field
	if strings.TrimSpace(m.body.Value()) == "" {
		return fmt.Errorf("✍️ Message body cannot be empty")
	}

	return nil
}

func (m Model) sendEmail() tea.Cmd {
	// Validate
	if err := m.validate(); err != nil {
		return func() tea.Msg {
			return types.ErrorMsg{Err: err}
		}
	}

	return func() tea.Msg {
		var err error

		if m.mode == ModeReply || m.mode == ModeReplyAll {
			// Send reply with threading headers
			req := types.ReplyRequest{
				EmailID:  m.originalID,
				Body:     m.body.Value(),
				ReplyAll: m.mode == ModeReplyAll,
			}

			// Add threading headers if we have the original email
			if m.originalEmail != nil {
				req.MessageID = m.originalEmail.MessageID
				req.ThreadID = m.originalEmail.ThreadID
				// In a real implementation, References would accumulate the chain
				// For now, we'll just include the original MessageID
				if m.originalEmail.MessageID != "" {
					req.References = []string{m.originalEmail.MessageID}
				}
			}

			err = m.client.SendReply(req)
		} else {
			// Send new email
			err = m.client.SendCompose(types.ComposeRequest{
				To:      m.to.Value(),
				Cc:      m.cc.Value(),
				Bcc:     m.bcc.Value(),
				Subject: m.subject.Value(),
				Body:    m.body.Value(),
			})
		}

		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.EmailSentMsg{Success: true}
	}
}

func (m *Model) loadAISuggestions() tea.Cmd {
	if m.originalID == "" {
		return nil
	}

	return func() tea.Msg {
		suggestions, err := m.client.GetDraftSuggestions(m.originalID, "")
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.DraftSuggestionsLoadedMsg{Suggestions: suggestions}
	}
}

// Message types
type (
	CancelMsg struct{}

	SentSuccessMsg struct{}
)

// quoteEmail formats an email body with '>' prefix for replying
func quoteEmail(from, date, body string) string {
	var quoted strings.Builder

	// Add attribution line
	quoted.WriteString(fmt.Sprintf("On %s, %s wrote:\n", date, from))

	// Quote each line of the body with '>' prefix
	lines := strings.Split(body, "\n")
	for _, line := range lines {
		quoted.WriteString("> " + line + "\n")
	}

	return quoted.String()
}
