package types

// EmailRow represents an email in the inbox list
type EmailRow struct {
	ID               string `json:"id"`
	ThreadID         string `json:"threadId"`
	From             string `json:"from"`
	FromEmail        string `json:"fromEmail"`
	Subject          string `json:"subject"`
	Snippet          string `json:"snippet"`
	Date             string `json:"date"`
	DateShort        string `json:"dateShort"`
	IsRead           bool   `json:"isRead"`
	IsStarred        bool   `json:"isStarred"`
	Priority         int    `json:"priority"`
	PriorityCategory string `json:"priorityCategory"`
}

// EmailDetail represents full email details
type EmailDetail struct {
	ID               string   `json:"id"`
	ThreadID         string   `json:"threadId"`
	MessageID        string   `json:"messageId"`
	From             string   `json:"from"`
	FromEmail        string   `json:"fromEmail"`
	To               string   `json:"to"`
	Subject          string   `json:"subject"`
	Date             string   `json:"date"`
	BodyText         string   `json:"bodyText"`
	BodyHTML         string   `json:"bodyHtml"`
	Markdown         string   `json:"markdown"`
	Snippet          string   `json:"snippet"`
	IsRead           bool     `json:"isRead"`
	IsStarred        bool     `json:"isStarred"`
	Folder           string   `json:"folder"`
	Labels           []string `json:"labels"`
	Priority         int      `json:"priority"`
	PriorityCategory string   `json:"priorityCategory"`
	PriorityReason   string   `json:"priorityReason"`
}

// Stats represents email statistics
type Stats struct {
	Emails   int `json:"emails"`
	Unread   int `json:"unread"`
	Contacts int `json:"contacts"`
}

// QuickRepliesResponse represents AI quick reply suggestions
type QuickRepliesResponse struct {
	Replies []string `json:"replies"`
}

// SummarizeResponse represents AI email summary
type SummarizeResponse struct {
	Summary     string   `json:"summary"`
	KeyPoints   []string `json:"keyPoints"`
	ActionItems []string `json:"actionItems"`
	Sentiment   string   `json:"sentiment"`
}

// DraftSuggestionsResponse represents AI draft suggestions
type DraftSuggestionsResponse struct {
	Suggestions []string `json:"suggestions"`
}

// ComposeRequest represents email composition data
type ComposeRequest struct {
	To      string `json:"to"`
	Cc      string `json:"cc,omitempty"`
	Bcc     string `json:"bcc,omitempty"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

// ReplyRequest represents email reply data
type ReplyRequest struct {
	EmailID    string   `json:"emailId"`
	Body       string   `json:"body"`
	ReplyAll   bool     `json:"replyAll,omitempty"`
	// Threading headers for proper email conversation threading
	MessageID  string   `json:"messageId,omitempty"`  // Original Message-ID
	References []string `json:"references,omitempty"` // Threading chain
	ThreadID   string   `json:"threadId,omitempty"`   // Thread identifier
}

// StarRequest represents email star toggle
type StarRequest struct {
	EmailID string `json:"emailId"`
	Starred bool   `json:"starred"`
}

// ReadRequest represents email read status toggle
type ReadRequest struct {
	EmailID string `json:"emailId"`
	Read    bool   `json:"read"`
}

// SyncResponse represents the sync completion response
type SyncResponse struct {
	Success       bool   `json:"success"`
	Message       string `json:"message"`
	HasNewEmails  bool   `json:"hasNewEmails"`
	NewEmailCount int    `json:"newEmailCount"`
	TotalFetched  int    `json:"totalFetched"`
	Timestamp     string `json:"timestamp"`
	Error         string `json:"error,omitempty"`
}

// Message types for Bubble Tea
type (
	// EmailsLoadedMsg is sent when emails are fetched
	EmailsLoadedMsg struct {
		Emails []EmailRow
		Append bool // If true, append to existing emails (lazy loading)
	}

	// EmailLoadedMsg is sent when email detail is fetched
	EmailLoadedMsg struct {
		Email EmailDetail
	}

	// StatsLoadedMsg is sent when stats are fetched
	StatsLoadedMsg struct {
		Stats Stats
	}

	// ErrorMsg is sent when an error occurs
	ErrorMsg struct {
		Err error
	}

	// ToastMsg is sent to show a transient notification
	ToastMsg struct {
		Message string
		Level   string // "info", "success", "error"
	}

	// BundleCountsMsg is sent when smart bundle counts are loaded
	BundleCountsMsg struct {
		Counts map[string]int
	}

	// QuickRepliesLoadedMsg is sent when AI quick replies are loaded
	QuickRepliesLoadedMsg struct {
		Replies []string
	}

	// SummaryLoadedMsg is sent when AI summary is loaded
	SummaryLoadedMsg struct {
		Summary SummarizeResponse
	}

	// DraftSuggestionsLoadedMsg is sent when AI draft suggestions are loaded
	DraftSuggestionsLoadedMsg struct {
		Suggestions []string
	}

	// EmailSentMsg is sent when an email is sent successfully
	EmailSentMsg struct {
		Success bool
	}

	// SyncCompletedMsg is sent when email sync completes
	SyncCompletedMsg struct {
		Response SyncResponse
	}

	// SyncStartedMsg is sent when email sync begins
	SyncStartedMsg struct{}
)

func (e ErrorMsg) Error() string {
	return e.Err.Error()
}
