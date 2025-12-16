package styles

import "github.com/charmbracelet/lipgloss"

// Theme colors matching Claude Mail's aesthetic
var (
	// Claude orange theme
	Primary   = lipgloss.Color("#FF6B35")
	Surface   = lipgloss.Color("#2D2D2D")
	Text      = lipgloss.Color("#FFFFFF")
	TextMuted = lipgloss.Color("#808080")
	Success   = lipgloss.Color("#4CAF50")
	Warning   = lipgloss.Color("#FFC107")
	Error     = lipgloss.Color("#FF0000")

	// Priority colors
	PriorityUrgent    = lipgloss.Color("#FF0000")
	PriorityImportant = lipgloss.Color("#FF6B35")
	PriorityNormal    = lipgloss.Color("#4CAF50")
	PriorityLow       = lipgloss.Color("#808080")

	// Borders
	BorderNormal = lipgloss.Color("#808080")
	BorderFocus  = Primary
)

// Common styles
var (
	TitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(Primary).
			PaddingLeft(1).
			PaddingRight(1)

	SubtitleStyle = lipgloss.NewStyle().
			Foreground(TextMuted).
			PaddingLeft(1)

	BorderStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(BorderNormal).
			Padding(0, 1)

	FocusedBorderStyle = lipgloss.NewStyle().
				BorderStyle(lipgloss.RoundedBorder()).
				BorderForeground(BorderFocus).
				Padding(0, 1)

	StatusStyle = lipgloss.NewStyle().
			Background(Surface).
			Foreground(Text).
			Padding(0, 1)

	HelpStyle = lipgloss.NewStyle().
			Foreground(TextMuted).
			Padding(0, 1)

	PrimaryStyle = lipgloss.NewStyle().
			Foreground(Primary).
			Bold(true)
)

// PriorityColor returns the color for a priority category
func PriorityColor(category string) lipgloss.Color {
	switch category {
	case "urgent":
		return PriorityUrgent
	case "important":
		return PriorityImportant
	case "normal":
		return PriorityNormal
	case "low":
		return PriorityLow
	default:
		return TextMuted
	}
}

// PriorityIcon returns an emoji for priority
func PriorityIcon(category string) string {
	switch category {
	case "urgent":
		return "🔴"
	case "important":
		return "🟠"
	case "normal":
		return "🟢"
	case "low":
		return "⚫"
	default:
		return "⚪"
	}
}
