package main

import (
	"fmt"
	"log"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/samay58/claude-mail/tui/internal/app"
)

func main() {
	// Get agent URL from environment or use default
	agentURL := os.Getenv("CLAUDE_MAIL_AGENT_URL")
	if agentURL == "" {
		agentURL = "http://localhost:5178"
	}

	// Create the Bubble Tea program
	p := tea.NewProgram(
		app.New(agentURL),
		tea.WithAltScreen(),       // Use alternate screen buffer
		tea.WithMouseCellMotion(), // Enable mouse support
	)

	// Run the program
	if _, err := p.Run(); err != nil {
		log.Fatal(err)
	}

	fmt.Println("Thanks for using Claude Mail! 👋")
}
