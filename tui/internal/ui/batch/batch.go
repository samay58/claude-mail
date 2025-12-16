package batch

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
)

// Model represents the batch selection state for multi-select operations
type Model struct {
	// Selection state
	selectMode     bool            // Whether multi-select is active
	selectedEmails map[string]bool // Map of email ID -> selected status
	selectedCount  int             // Count of selected emails for quick access

	// Action state
	pendingAction string // Current pending bulk action
	confirmDialog bool   // Whether confirmation dialog is shown

	// Progress tracking
	processing     bool // Whether a bulk operation is in progress
	processedCount int  // Number of items processed
	totalCount     int  // Total items to process
	currentAction  string // Description of current action

	// UI dimensions
	width  int
	height int
}

// New creates a new batch selection model
func New() Model {
	return Model{
		selectedEmails: make(map[string]bool),
		selectMode:     false,
		selectedCount:  0,
	}
}

// Init initializes the component
func (m Model) Init() tea.Cmd {
	return nil
}

// Update handles messages for batch operations
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.confirmDialog {
			// Handle confirmation dialog
			switch msg.String() {
			case "y", "Y":
				m.confirmDialog = false
				return m, m.executeAction()
			case "n", "N", "esc":
				m.confirmDialog = false
				m.pendingAction = ""
				return m, nil
			}
			return m, nil
		}

		// Regular key handling
		switch msg.String() {
		case "x":
			// Toggle select mode
			m.selectMode = !m.selectMode
			if !m.selectMode {
				// Clear selections when exiting select mode
				m.clearSelections()
			}
			return m, nil

		case " ":
			// Toggle selection of current item (handled by parent)
			return m, nil

		case "a":
			// Select all (handled by parent)
			return m, nil

		case "n":
			// Select none
			m.clearSelections()
			return m, nil

		case "i":
			// Invert selection (handled by parent)
			return m, nil

		// Bulk actions
		case "r":
			if m.selectMode && m.selectedCount > 0 {
				m.pendingAction = "read"
				return m, m.executeAction()
			}
		case "u":
			if m.selectMode && m.selectedCount > 0 {
				m.pendingAction = "unread"
				return m, m.executeAction()
			}
		case "s":
			if m.selectMode && m.selectedCount > 0 {
				m.pendingAction = "star"
				return m, m.executeAction()
			}
		case "d":
			if m.selectMode && m.selectedCount > 0 {
				// Delete requires confirmation
				m.pendingAction = "delete"
				m.confirmDialog = true
				return m, nil
			}
		case "e":
			if m.selectMode && m.selectedCount > 0 {
				m.pendingAction = "archive"
				return m, m.executeAction()
			}
		}

	case BulkProgressMsg:
		// Update progress
		m.processedCount = msg.Current
		m.totalCount = msg.Total
		m.currentAction = msg.Action

		if msg.Current >= msg.Total {
			// Operation complete
			m.processing = false
			m.clearSelections()
			m.selectMode = false
		}
		return m, nil

	case BulkCompleteMsg:
		// Operation completed
		m.processing = false
		m.clearSelections()
		m.selectMode = false
		return m, nil

	case types.ErrorMsg:
		// Error occurred during bulk operation
		m.processing = false
		return m, nil
	}

	return m, nil
}

// View renders the batch selection UI components
func (m Model) View() string {
	if m.confirmDialog {
		return m.renderConfirmDialog()
	}

	if m.processing {
		return m.renderProgressBar()
	}

	if m.selectMode && m.selectedCount > 0 {
		return m.renderActionBar()
	}

	return ""
}

// renderActionBar renders the action bar when items are selected
func (m Model) renderActionBar() string {
	style := lipgloss.NewStyle().
		Background(styles.Primary).
		Foreground(lipgloss.Color("#000000")).
		Padding(0, 1)

	actions := fmt.Sprintf("%d selected | r: Read | u: Unread | s: Star | e: Archive | d: Delete | ESC: Cancel",
		m.selectedCount)

	return style.Render(actions)
}

// renderConfirmDialog renders the confirmation dialog for destructive actions
func (m Model) renderConfirmDialog() string {
	dialogStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(styles.Warning).
		Padding(1, 2).
		Width(50)

	titleStyle := lipgloss.NewStyle().
		Foreground(styles.Warning).
		Bold(true)

	title := titleStyle.Render("⚠️  Confirm Delete")

	message := fmt.Sprintf("Are you sure you want to delete %d email(s)?", m.selectedCount)
	prompt := "Press Y to confirm, N to cancel"

	content := lipgloss.JoinVertical(lipgloss.Left,
		title,
		"",
		message,
		"",
		prompt,
	)

	return dialogStyle.Render(content)
}

// renderProgressBar renders the progress bar for bulk operations
func (m Model) renderProgressBar() string {
	width := 40
	filled := int(float64(m.processedCount) / float64(m.totalCount) * float64(width))

	progressBar := "["
	for i := 0; i < width; i++ {
		if i < filled {
			progressBar += "="
		} else if i == filled {
			progressBar += ">"
		} else {
			progressBar += " "
		}
	}
	progressBar += "]"

	percentage := int(float64(m.processedCount) / float64(m.totalCount) * 100)
	status := fmt.Sprintf("%s %s %d/%d (%d%%)",
		m.currentAction,
		progressBar,
		m.processedCount,
		m.totalCount,
		percentage)

	style := lipgloss.NewStyle().
		Foreground(styles.Primary).
		Bold(true)

	return style.Render(status)
}

// Helper methods

// ToggleSelection toggles the selection state of an email
func (m *Model) ToggleSelection(emailID string) {
	if m.selectedEmails[emailID] {
		delete(m.selectedEmails, emailID)
		m.selectedCount--
	} else {
		m.selectedEmails[emailID] = true
		m.selectedCount++
	}
}

// SelectAll marks all provided email IDs as selected
func (m *Model) SelectAll(emailIDs []string) {
	for _, id := range emailIDs {
		if !m.selectedEmails[id] {
			m.selectedEmails[id] = true
			m.selectedCount++
		}
	}
}

// InvertSelection inverts the selection state for provided emails
func (m *Model) InvertSelection(allEmailIDs []string) {
	newSelection := make(map[string]bool)
	newCount := 0

	for _, id := range allEmailIDs {
		if !m.selectedEmails[id] {
			newSelection[id] = true
			newCount++
		}
	}

	m.selectedEmails = newSelection
	m.selectedCount = newCount
}

// clearSelections clears all selections
func (m *Model) clearSelections() {
	m.selectedEmails = make(map[string]bool)
	m.selectedCount = 0
}

// Reset clears all batch state including selections, progress, and mode
func (m *Model) Reset() {
	m.selectMode = false
	m.selectedEmails = make(map[string]bool)
	m.selectedCount = 0
	m.pendingAction = ""
	m.confirmDialog = false
	m.processing = false
	m.processedCount = 0
	m.totalCount = 0
	m.currentAction = ""
}

// IsSelected returns whether an email is selected
func (m Model) IsSelected(emailID string) bool {
	return m.selectedEmails[emailID]
}

// GetSelectedIDs returns a slice of selected email IDs
func (m Model) GetSelectedIDs() []string {
	ids := make([]string, 0, len(m.selectedEmails))
	for id, selected := range m.selectedEmails {
		if selected {
			ids = append(ids, id)
		}
	}
	return ids
}

// IsSelectMode returns whether select mode is active
func (m Model) IsSelectMode() bool {
	return m.selectMode
}

// GetSelectedCount returns the count of selected emails
func (m Model) GetSelectedCount() int {
	return m.selectedCount
}

// SetSize sets the component size
func (m *Model) SetSize(width, height int) {
	m.width = width
	m.height = height
}

// executeAction returns a command to execute the pending action
func (m Model) executeAction() tea.Cmd {
	if m.pendingAction == "" || m.selectedCount == 0 {
		return nil
	}

	action := m.pendingAction
	ids := m.GetSelectedIDs()

	return func() tea.Msg {
		// This will be handled by the parent component
		// which has access to the data client
		return BulkActionRequestMsg{
			Action:   action,
			EmailIDs: ids,
		}
	}
}

// Message types

// BulkActionRequestMsg requests a bulk action be performed
type BulkActionRequestMsg struct {
	Action   string
	EmailIDs []string
}

// BulkProgressMsg updates progress for a bulk operation
type BulkProgressMsg struct {
	Current int
	Total   int
	Action  string
}

// BulkCompleteMsg indicates a bulk operation completed
type BulkCompleteMsg struct {
	Action      string
	SuccessCount int
	FailureCount int
}