package statusbar

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/styles"
)

// Model represents the status bar component
type Model struct {
	connected    bool
	currentView  string
	syncStatus   SyncStatus
	errorMessage string
	width        int
}

// SyncStatus represents the synchronization state
type SyncStatus struct {
	LastSync   time.Time
	InProgress bool
}

// New creates a new status bar model
func New() Model {
	return Model{
		connected:   false,
		currentView: "inbox",
		syncStatus: SyncStatus{
			LastSync:   time.Time{},
			InProgress: false,
		},
		errorMessage: "",
		width:        80,
	}
}

// Init initializes the status bar component
func (m Model) Init() tea.Cmd {
	return nil
}

// Update handles messages
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	return m, nil
}

// View renders the status bar
func (m Model) View() string {
	if m.width < 40 {
		// Don't render on very narrow screens
		return ""
	}

	left := m.renderLeft()
	center := m.renderCenter()
	right := m.renderRight()

	// Calculate spacing to distribute across width
	leftWidth := lipgloss.Width(left)
	centerWidth := lipgloss.Width(center)
	rightWidth := lipgloss.Width(right)

	// Available space for padding
	totalContentWidth := leftWidth + centerWidth + rightWidth
	availableSpace := m.width - totalContentWidth - 4 // Account for padding

	if availableSpace < 0 {
		availableSpace = 0
	}

	// Distribute space: 40% left padding, 60% right padding
	leftPadding := availableSpace * 40 / 100
	rightPadding := availableSpace - leftPadding

	// Join sections with spacing
	statusBar := lipgloss.JoinHorizontal(
		lipgloss.Top,
		left,
		strings.Repeat(" ", leftPadding),
		center,
		strings.Repeat(" ", rightPadding),
		right,
	)

	// Style the entire bar
	barStyle := lipgloss.NewStyle().
		Foreground(styles.TextMuted).
		Background(lipgloss.Color("#1a1a1a")).
		Padding(0, 1).
		Width(m.width)

	return barStyle.Render(statusBar)
}

// SetSize sets the component width
func (m *Model) SetSize(width int) {
	m.width = width
}

// SetConnected updates the connection status
func (m *Model) SetConnected(connected bool) {
	m.connected = connected
}

// SetCurrentView updates the current view name
func (m *Model) SetCurrentView(view string) {
	m.currentView = view
}

// SetSyncInProgress updates sync status
func (m *Model) SetSyncInProgress(inProgress bool) {
	m.syncStatus.InProgress = inProgress
	if !inProgress {
		m.syncStatus.LastSync = time.Now()
	}
}

// SetError sets an error message
func (m *Model) SetError(err string) {
	m.errorMessage = err
}

// ClearError clears the error message
func (m *Model) ClearError() {
	m.errorMessage = ""
}

// Helper rendering functions

func (m Model) renderLeft() string {
	// Connection indicator + current view
	icon := "●"  // Connected
	iconColor := styles.Success
	if !m.connected {
		icon = "○"  // Disconnected
		iconColor = styles.Error
	}

	connectionStyle := lipgloss.NewStyle().Foreground(iconColor)
	viewStyle := lipgloss.NewStyle().Foreground(styles.Text).Bold(true)

	return lipgloss.JoinHorizontal(
		lipgloss.Top,
		connectionStyle.Render(icon),
		" ",
		viewStyle.Render(m.currentView),
	)
}

func (m Model) renderCenter() string {
	if m.syncStatus.InProgress {
		syncStyle := lipgloss.NewStyle().Foreground(styles.Primary)
		return syncStyle.Render("⟳ Syncing...")
	}

	if !m.syncStatus.LastSync.IsZero() {
		elapsed := time.Since(m.syncStatus.LastSync)
		timeStyle := lipgloss.NewStyle().Foreground(styles.TextMuted)
		return timeStyle.Render(fmt.Sprintf("Last sync: %s ago", formatDuration(elapsed)))
	}

	return ""
}

func (m Model) renderRight() string {
	if m.errorMessage != "" {
		errorStyle := lipgloss.NewStyle().
			Foreground(styles.Error).
			Bold(true)
		return errorStyle.Render("⚠ " + m.errorMessage)
	}
	return ""
}

// formatDuration formats a duration into a human-readable string
func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	} else if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	} else if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}
