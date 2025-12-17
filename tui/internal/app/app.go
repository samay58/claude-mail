package app

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/samay58/claude-mail/tui/internal/data"
	"github.com/samay58/claude-mail/tui/internal/styles"
	"github.com/samay58/claude-mail/tui/internal/types"
	"github.com/samay58/claude-mail/tui/internal/ui/compose"
	"github.com/samay58/claude-mail/tui/internal/ui/help"
	"github.com/samay58/claude-mail/tui/internal/ui/inbox"
	"github.com/samay58/claude-mail/tui/internal/ui/nav"
	"github.com/samay58/claude-mail/tui/internal/ui/preview"
	"github.com/samay58/claude-mail/tui/internal/ui/quickreply"
	"github.com/samay58/claude-mail/tui/internal/ui/search"
	"github.com/samay58/claude-mail/tui/internal/ui/statusbar"
	"github.com/samay58/claude-mail/tui/internal/ui/toast"
	"github.com/samay58/claude-mail/tui/internal/ui/batch"
)

type Model struct {
	client     *data.Client
	nav        nav.Model
	inbox      inbox.Model
	preview    preview.Model
	compose    compose.Model
	quickReply quickreply.Model
	search     search.Model
	help       help.Model
	toast      toast.Model
	statusBar  statusbar.Model
	stats      *types.Stats

	width  int
	height int

	// Focus state: "nav", "inbox", or "preview"
	focused string

	// View state: "list", "detail", "compose", "search", or "help"
	view string

	// Current view for filtering emails
	currentView string

	// UI state
	ready      bool
	showNav    bool // Hide nav on narrow screens
	showSearch bool // Search overlay visible
	showHelp   bool // Help overlay visible
	err        error
}

func New(agentURL string) Model {
	client := data.NewClient(agentURL)

	return Model{
		client:      client,
		nav:         nav.New(client),
		inbox:       inbox.New(client),
		preview:     preview.New(client),
		compose:     compose.New(client),
		quickReply:  quickreply.New(client),
		search:      search.New(client),
		help:        help.New(),
		toast:       toast.New(),
		statusBar:   statusbar.New(),
		focused:     "inbox",
		view:        "list",
		currentView: "inbox",
		showNav:     true,
		showSearch:  false,
		showHelp:    false,
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.nav.Init(),
		m.inbox.Init(),
		m.loadStats(),
		m.checkHealth(),
	)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true

		// Responsive layout breakpoints
		m.showNav = m.width >= 100

		var navWidth, inboxWidth, previewWidth int
		if m.showNav {
			// Wide mode: Nav (20%) + Inbox (35%) + Preview (45%)
			navWidth = max(20, m.width*20/100)
			inboxWidth = max(30, m.width*35/100)
			previewWidth = m.width - navWidth - inboxWidth - 4 // Account for borders
		} else {
			// Medium mode: Inbox (40%) + Preview (60%)
			navWidth = 0
			inboxWidth = m.width * 40 / 100
			previewWidth = m.width - inboxWidth - 2
		}

		m.nav.SetSize(navWidth, m.height-5)
		m.inbox.SetSize(inboxWidth-2, m.height-5)
		m.preview.SetSize(previewWidth-2, m.height-5)
		m.compose.SetSize(m.width-4, m.height-5)
		m.quickReply.SetSize(m.width-4, 12)
		m.search.SetSize(m.width-4, m.height-5)
		m.help.SetSize(m.width-4, m.height-5)
		m.toast.SetSize(m.width)
		m.statusBar.SetSize(m.width)

		return m, nil

	case tea.KeyMsg:
		// View-specific global shortcuts
		if m.view == "list" {
			// Number keys for view switching in list mode
			switch msg.String() {
			case "1", "2", "3", "4", "5", "6", "7", "8", "9", "0":
				// Route to nav for handling
				var cmd tea.Cmd
				m.nav, cmd = m.nav.Update(msg)
				return m, cmd

			case "c":
				// Compose new email
				m.view = "compose"
				cmd := m.compose.SetMode(compose.ModeCompose, "", nil)
				return m, cmd
			}
		} else if m.view == "detail" {
			// Quick reply keys in detail mode
			switch msg.String() {
			case "1", "2", "3":
				// Route to quick reply for handling
				var cmd tea.Cmd
				m.quickReply, cmd = m.quickReply.Update(msg)
				return m, cmd
			}
		}

		// Global shortcuts across all views
		switch msg.String() {
		case "/":
			// Open search overlay (not when already in search/help)
			if !m.showSearch && !m.showHelp {
				m.showSearch = true
				m.search.Reset() // Clear previous search state
				return m, m.search.Init()
			}

		case "?":
			// Open help overlay (not when already in search/help)
			if !m.showSearch && !m.showHelp {
				m.showHelp = true
				return m, m.help.Init()
			}

		case "ctrl+c", "q":
			// Only quit from list view
			if m.view == "list" && (m.focused == "nav" || m.focused == "inbox") {
				return m, tea.Quit
			}

		case "tab":
			// Cycle focus: nav → inbox → preview → nav
			// Only in list/detail view, NOT in compose (compose handles Tab itself)
			if m.view == "list" || m.view == "detail" {
				m.updateFocus(m.nextFocus())
				return m, nil
			}

		case "shift+tab":
			// Cycle backward
			// Only in list/detail view, NOT in compose (compose handles Shift+Tab itself)
			if m.view == "list" || m.view == "detail" {
				m.updateFocus(m.prevFocus())
				return m, nil
			}

		case "h":
			// Vim-style: move left (to nav or inbox)
			if m.focused == "preview" {
				m.updateFocus("inbox")
			} else if m.focused == "inbox" && m.showNav {
				m.updateFocus("nav")
			}
			return m, nil

		case "l":
			// Vim-style: move right (to inbox or preview)
			// Only process if NOT in text input mode
			if m.view != "compose" && !m.showSearch && !m.showHelp {
				if m.focused == "nav" {
					m.updateFocus("inbox")
				} else if m.focused == "inbox" {
					m.updateFocus("preview")
				}
				return m, nil
			}

		case "g":
			// Go to nav
			// Only process if NOT in text input mode
			if m.view != "compose" && !m.showSearch && !m.showHelp {
				if m.showNav {
					m.updateFocus("nav")
				}
				return m, nil
			}

		case "i":
			// Go to inbox
			// Only process if NOT in text input mode
			if m.view != "compose" && !m.showSearch && !m.showHelp {
				m.updateFocus("inbox")
				return m, nil
			}

		case "p":
			// Go to preview
			// Only process if NOT in text input mode
			if m.view != "compose" && !m.showSearch && !m.showHelp {
				m.updateFocus("preview")
				return m, nil
			}

		case "esc":
			// PRIORITY 1: Let overlays handle Escape first
			// Don't intercept Esc when overlays are open - let components handle it
			if m.showHelp || m.showSearch {
				// Fall through to component updates below
				// (help/search will send CloseHelpMsg/CloseSearchMsg)
				break
			}

			// PRIORITY 2: Then handle view navigation
			if m.view == "compose" {
				m.view = "list"
				m.updateFocus("inbox")
				return m, nil
			} else if m.view == "detail" {
				m.view = "list"
				m.updateFocus("inbox")
				return m, nil
			} else if m.focused == "preview" {
				m.updateFocus("inbox")
			}
			return m, nil
		}

	case inbox.OpenEmailMsg:
		// Open email in detail view
		m.view = "detail"
		m.updateFocus("preview")
		m.quickReply.SetFocus(true)
		cmds = append(cmds, m.preview.Load(msg.EmailID))
		cmds = append(cmds, m.quickReply.Load(msg.EmailID))
		return m, tea.Batch(cmds...)

	case nav.ViewSelectedMsg:
		// User selected a view/bundle
		m.currentView = string(msg.View)
		m.statusBar.SetCurrentView(m.currentView)
		// Reload inbox with new filter
		return m, func() tea.Msg {
			emails, err := m.client.ListEmailsByView(0, 50, "", m.currentView)
			if err != nil {
				return types.ErrorMsg{Err: err}
			}
			return types.EmailsLoadedMsg{Emails: emails, Append: false}
		}

	case preview.ReplyMsg:
		// Open composer in reply mode
		m.view = "compose"
		email, _ := m.client.GetEmail(msg.EmailID)
		mode := compose.ModeReply
		if msg.ReplyAll {
			mode = compose.ModeReplyAll
		}
		cmd := m.compose.SetMode(mode, msg.EmailID, email)
		return m, cmd

	case preview.ForwardMsg:
		// Open composer in forward mode
		m.view = "compose"
		email, _ := m.client.GetEmail(msg.EmailID)
		cmd := m.compose.SetMode(compose.ModeForward, msg.EmailID, email)
		return m, cmd

	case compose.CancelMsg:
		// Cancel composition
		m.view = "list"
		m.updateFocus("inbox")
		return m, nil

	case compose.SentSuccessMsg, types.EmailSentMsg:
		// Email sent successfully
		m.view = "list"
		m.updateFocus("inbox")
		// Add success toast
		cmd := m.toast.Add("Email sent successfully!", toast.Success)
		cmds = append(cmds, cmd)
		// Refresh inbox to show sent email
		cmds = append(cmds, func() tea.Msg {
			emails, err := m.client.ListEmailsByView(0, 50, "", m.currentView)
			if err != nil {
				return types.ErrorMsg{Err: err}
			}
			return types.EmailsLoadedMsg{Emails: emails, Append: false}
		})
		return m, tea.Batch(cmds...)

	case types.StatsLoadedMsg:
		m.stats = &msg.Stats

	case types.ErrorMsg:
		m.err = msg.Err
		// Show error toast
		cmd := m.toast.Add(msg.Err.Error(), toast.Error)
		cmds = append(cmds, cmd)
		// Update status bar error
		m.statusBar.SetError(msg.Err.Error())

	case healthMsg:
		if !msg.ok {
			m.err = fmt.Errorf("agent not running")
			m.statusBar.SetConnected(false)
			m.statusBar.SetError("Agent not running")
			return m, tea.Quit
		}
		m.statusBar.SetConnected(true)
		m.statusBar.ClearError()

	case search.CloseSearchMsg:
		// Close search overlay
		m.showSearch = false
		return m, nil

	case search.OpenEmailMsg:
		// Open email from search results
		m.showSearch = false
		m.view = "detail"
		m.updateFocus("preview")
		m.quickReply.SetFocus(true)
		cmds = append(cmds, m.preview.Load(msg.EmailID))
		cmds = append(cmds, m.quickReply.Load(msg.EmailID))
		return m, tea.Batch(cmds...)

	case help.CloseHelpMsg:
		// Close help overlay
		m.showHelp = false
		return m, nil

	case toast.TickMsg:
		// Update toast for auto-dismiss
		var cmd tea.Cmd
		m.toast, cmd = m.toast.Update(msg)
		cmds = append(cmds, cmd)
		return m, tea.Batch(cmds...)

	case toast.AddToastMsg:
		// Add new toast
		cmd := m.toast.Add(msg.Message, msg.Type)
		cmds = append(cmds, cmd)
		return m, tea.Batch(cmds...)

	case batch.BulkCompleteMsg:
		// Bulk operation completed - show toast
		var message string
		var toastType toast.ToastType

		if msg.FailureCount > 0 {
			message = fmt.Sprintf("%s: %d succeeded, %d failed", msg.Action, msg.SuccessCount, msg.FailureCount)
			toastType = toast.Warning
		} else {
			message = fmt.Sprintf("%s: %d emails updated", msg.Action, msg.SuccessCount)
			toastType = toast.Success
		}

		cmd := m.toast.Add(message, toastType)
		cmds = append(cmds, cmd)

		// Refresh inbox to show updated emails
		cmds = append(cmds, func() tea.Msg {
			emails, err := m.client.ListEmailsByView(0, 50, "", m.currentView)
			if err != nil {
				return types.ErrorMsg{Err: err}
			}
			return types.EmailsLoadedMsg{Emails: emails, Append: false}
		})
		return m, tea.Batch(cmds...)

	case types.SyncStartedMsg:
		// Sync started - update status bar first, then trigger sync
		m.statusBar.SetSyncInProgress(true)
		// Return a command to trigger the actual sync
		return m, func() tea.Msg {
			syncResp, err := m.client.TriggerSync()
			if err != nil {
				return types.ErrorMsg{Err: err}
			}
			return types.SyncCompletedMsg{Response: *syncResp}
		}

	case types.SyncCompletedMsg:
		// Sync completed - clear status bar and show toast
		m.statusBar.SetSyncInProgress(false)

		var message string
		var toastType toast.ToastType

		if msg.Response.HasNewEmails {
			message = msg.Response.Message // "Sync complete"
			toastType = toast.Success
		} else {
			message = msg.Response.Message // "No new emails"
			toastType = toast.Info
		}

		cmd := m.toast.Add(message, toastType)
		cmds = append(cmds, cmd)

		// Refresh inbox to show new emails if any
		cmds = append(cmds, func() tea.Msg {
			emails, err := m.client.ListEmailsByView(0, 50, "", m.currentView)
			if err != nil {
				return types.ErrorMsg{Err: err}
			}
			return types.EmailsLoadedMsg{Emails: emails, Append: false}
		})
		return m, tea.Batch(cmds...)
	}

	// Always update toast (for key dismissal)
	var toastCmd tea.Cmd
	m.toast, toastCmd = m.toast.Update(msg)
	cmds = append(cmds, toastCmd)

	// Update all components based on current view
	var cmd tea.Cmd

	// Update search or help overlay if visible
	if m.showSearch {
		m.search, cmd = m.search.Update(msg)
		cmds = append(cmds, cmd)
	} else if m.showHelp {
		m.help, cmd = m.help.Update(msg)
		cmds = append(cmds, cmd)
	} else {
		// Normal view updates when no overlay is shown
		if m.view == "list" {
			m.nav, cmd = m.nav.Update(msg)
			cmds = append(cmds, cmd)

			m.inbox, cmd = m.inbox.Update(msg)
			cmds = append(cmds, cmd)

			m.preview, cmd = m.preview.Update(msg)
			cmds = append(cmds, cmd)
		} else if m.view == "detail" {
			m.preview, cmd = m.preview.Update(msg)
			cmds = append(cmds, cmd)

			m.quickReply, cmd = m.quickReply.Update(msg)
			cmds = append(cmds, cmd)
		} else if m.view == "compose" {
			m.compose, cmd = m.compose.Update(msg)
			cmds = append(cmds, cmd)
		}
	}

	return m, tea.Batch(cmds...)
}

// Helper methods for focus management
func (m *Model) updateFocus(newFocus string) {
	m.focused = newFocus
	m.nav.SetFocus(newFocus == "nav")
	m.inbox.SetFocus(newFocus == "inbox")
	m.preview.SetFocus(newFocus == "preview")
}

func (m Model) nextFocus() string {
	if m.showNav {
		switch m.focused {
		case "nav":
			return "inbox"
		case "inbox":
			return "preview"
		default:
			return "nav"
		}
	} else {
		// No nav, just toggle inbox ↔ preview
		if m.focused == "inbox" {
			return "preview"
		}
		return "inbox"
	}
}

func (m Model) prevFocus() string {
	if m.showNav {
		switch m.focused {
		case "preview":
			return "inbox"
		case "inbox":
			return "nav"
		default:
			return "preview"
		}
	} else {
		// No nav, just toggle inbox ↔ preview
		if m.focused == "preview" {
			return "inbox"
		}
		return "preview"
	}
}

func (m Model) View() string {
	if !m.ready {
		return "Initializing..."
	}

	if m.err != nil {
		return lipgloss.NewStyle().
			Foreground(styles.Error).
			Render(fmt.Sprintf("Error: %v\n\nPress Ctrl+C to quit", m.err))
	}

	var b strings.Builder

	// Header
	b.WriteString(m.renderHeader() + "\n")

	// Main content based on view state
	var content string
	switch m.view {
	case "compose":
		// Full-screen composer
		content = m.compose.View()

	case "detail":
		// Full-screen preview with quick reply bar
		previewView := m.preview.View()
		quickReplyView := m.quickReply.View()
		content = lipgloss.JoinVertical(lipgloss.Left, previewView, quickReplyView)

	default: // "list"
		// Three-pane or two-pane layout
		if m.showNav {
			// Three panes
			navView := m.nav.View()
			inboxView := m.inbox.View()
			previewView := m.preview.View()

			divider := lipgloss.NewStyle().
				Foreground(styles.BorderNormal).
				Render("│")

			content = lipgloss.JoinHorizontal(
				lipgloss.Top,
				navView,
				divider,
				inboxView,
				divider,
				previewView,
			)
		} else {
			// Two panes (no nav)
			inboxView := m.inbox.View()
			previewView := m.preview.View()

			divider := lipgloss.NewStyle().
				Foreground(styles.BorderNormal).
				Render("│")

			content = lipgloss.JoinHorizontal(
				lipgloss.Top,
				inboxView,
				divider,
				previewView,
			)
		}
	}

	b.WriteString(content)

	// Footer
	b.WriteString("\n" + m.renderFooter())

	mainView := b.String()

	// Overlay search or help if visible (these are full-screen modals)
	if m.showSearch {
		// Center the search overlay
		searchView := m.search.View()
		overlay := lipgloss.Place(
			m.width,
			m.height,
			lipgloss.Center,
			lipgloss.Center,
			searchView,
			lipgloss.WithWhitespaceChars(" "),
		)
		return overlay
	}

	if m.showHelp {
		// Center the help overlay
		helpView := m.help.View()
		overlay := lipgloss.Place(
			m.width,
			m.height,
			lipgloss.Center,
			lipgloss.Center,
			helpView,
			lipgloss.WithWhitespaceChars(" "),
		)
		return overlay
	}

	// Render toasts on top-right corner (non-blocking notifications)
	toastView := m.toast.View()
	if toastView != "" {
		// Align toasts to the right
		toastStyled := lipgloss.NewStyle().
			Width(m.width).
			Align(lipgloss.Right).
			Render(toastView)

		// Prepend toasts to the top of the view
		return toastStyled + "\n" + mainView
	}

	return mainView
}

func (m Model) renderHeader() string {
	title := styles.TitleStyle.Render("✉️  Claude Mail")

	statsText := ""
	if m.stats != nil {
		statsText = styles.SubtitleStyle.Render(
			fmt.Sprintf("%d emails • %d unread • %d contacts",
				m.stats.Emails, m.stats.Unread, m.stats.Contacts))
	}

	header := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(styles.Primary).
		Padding(0, 1).
		Width(m.width - 2).
		Render(title + "  " + statsText)

	return header
}

func (m Model) renderFooter() string {
	var help string

	switch m.view {
	case "compose":
		help = "tab: next field • ctrl+s: send • alt+g: AI suggestions • ?: help • esc: cancel"

	case "detail":
		help = "j/k: scroll • s: summary • 1/2/3: quick reply • r: reply • a: reply all • f: forward • /: search • ?: help • esc: back"

	default: // "list"
		switch m.focused {
		case "nav":
			help = "↑↓: navigate • enter: select • 1-9,0: quick switch • c: compose • /: search • ?: help • tab: next pane • q: quit"
		case "inbox":
			help = "j/k: navigate • enter: open • c: compose • t: star • s: sync • 1-9: views • /: search • ?: help • tab/h/l: switch pane • q: quit"
		case "preview":
			help = "j/k: scroll • s: summary • r: reply • a: reply all • f: forward • /: search • ?: help • h/l/tab: switch pane • esc: back"
		}
	}

	// Combine status bar and help text
	statusBar := m.statusBar.View()
	helpText := styles.HelpStyle.Render(help)

	return lipgloss.JoinVertical(lipgloss.Left, statusBar, helpText)
}

func (m Model) loadStats() tea.Cmd {
	return func() tea.Msg {
		stats, err := m.client.GetStats()
		if err != nil {
			return types.ErrorMsg{Err: err}
		}
		return types.StatsLoadedMsg{Stats: *stats}
	}
}

func (m Model) checkHealth() tea.Cmd {
	return func() tea.Msg {
		err := m.client.Health()
		return healthMsg{ok: err == nil}
	}
}

type healthMsg struct {
	ok bool
}
