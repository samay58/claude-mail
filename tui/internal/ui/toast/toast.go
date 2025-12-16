package toast

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/styles"
)

// ToastType represents the type of toast message
type ToastType int

const (
	Success ToastType = iota
	Error
	Info
	Warning
)

// Toast represents a single toast notification
type Toast struct {
	Message   string
	Type      ToastType
	Duration  time.Duration
	CreatedAt time.Time
}

// Model represents the toast notification system
type Model struct {
	toasts []Toast
	width  int
}

// New creates a new toast model
func New() Model {
	return Model{
		toasts: []Toast{},
	}
}

// Init initializes the toast component
func (m Model) Init() tea.Cmd {
	return nil
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg.(type) {
	case tea.KeyMsg:
		// Any key press dismisses the oldest toast
		if len(m.toasts) > 0 {
			m.toasts = m.toasts[1:]
		}
		return m, nil

	case TickMsg:
		// Auto-remove expired toasts
		now := time.Now()
		var active []Toast
		for _, t := range m.toasts {
			if now.Sub(t.CreatedAt) < t.Duration {
				active = append(active, t)
			}
		}
		m.toasts = active

		// Continue ticking if we have active toasts
		if len(m.toasts) > 0 {
			return m, tick()
		}
		return m, nil
	}

	return m, nil
}

// View renders the toast notifications
func (m Model) View() string {
	if len(m.toasts) == 0 {
		return ""
	}

	var views []string
	for _, toast := range m.toasts {
		style := getToastStyle(toast.Type)
		views = append(views, style.Render(formatMessage(toast)))
	}

	// Stack toasts vertically
	return lipgloss.JoinVertical(lipgloss.Right, views...)
}

// SetSize sets the component size
func (m *Model) SetSize(width int) {
	m.width = width
}

// Add adds a new toast to the queue
func (m *Model) Add(message string, toastType ToastType) tea.Cmd {
	toast := Toast{
		Message:   message,
		Type:      toastType,
		Duration:  3 * time.Second,
		CreatedAt: time.Now(),
	}

	m.toasts = append(m.toasts, toast)

	// Limit to 3 visible toasts
	if len(m.toasts) > 3 {
		m.toasts = m.toasts[len(m.toasts)-3:]
	}

	// Start ticker if this is the first toast
	return tick()
}

// Helper functions

func getToastStyle(t ToastType) lipgloss.Style {
	base := lipgloss.NewStyle().
		Padding(0, 2).
		MarginBottom(1).
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#FFFFFF"))

	switch t {
	case Success:
		return base.
			Background(lipgloss.Color("#00AA00")).
			Foreground(lipgloss.Color("#FFFFFF"))
	case Error:
		return base.
			Background(lipgloss.Color("#FF0000")).
			Foreground(lipgloss.Color("#FFFFFF"))
	case Info:
		return base.
			Background(lipgloss.Color("#0066CC")).
			Foreground(lipgloss.Color("#FFFFFF"))
	case Warning:
		return base.
			Background(lipgloss.Color("#FF9900")).
			Foreground(lipgloss.Color("#FFFFFF"))
	default:
		return base.
			Background(styles.Primary).
			Foreground(lipgloss.Color("#FFFFFF"))
	}
}

func formatMessage(t Toast) string {
	icon := getIcon(t.Type)
	return icon + " " + t.Message
}

func getIcon(t ToastType) string {
	switch t {
	case Success:
		return "✓"
	case Error:
		return "✗"
	case Info:
		return "ℹ"
	case Warning:
		return "⚠"
	default:
		return "●"
	}
}

// Message types

// TickMsg is sent periodically to check for expired toasts
type TickMsg struct{}

func tick() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return TickMsg{}
	})
}

// AddToastMsg is sent to add a new toast
type AddToastMsg struct {
	Message string
	Type    ToastType
}
