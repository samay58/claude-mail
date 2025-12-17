package data

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/samay58/claude-mail/tui/internal/types"
)

// Client wraps HTTP calls to the Node agent API
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new agent API client
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Health checks if the agent is running
func (c *Client) Health() error {
	resp, err := c.httpClient.Get(c.baseURL + "/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check failed: %d", resp.StatusCode)
	}
	return nil
}

// GetStats fetches email statistics
func (c *Client) GetStats() (*types.Stats, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/stats")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var stats types.Stats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, err
	}
	return &stats, nil
}

// ListEmails fetches a list of emails
func (c *Client) ListEmails(offset, limit int, query string) ([]types.EmailRow, error) {
	return c.ListEmailsByView(offset, limit, query, "")
}

// ListEmailsByView fetches emails filtered by view
func (c *Client) ListEmailsByView(offset, limit int, query, view string) ([]types.EmailRow, error) {
	url := fmt.Sprintf("%s/emails?offset=%d&limit=%d", c.baseURL, offset, limit)
	if query != "" {
		url += "&q=" + query
	}
	if view != "" {
		url += "&view=" + view
	}

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var emails []types.EmailRow
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return nil, err
	}
	return emails, nil
}

// GetBundleCounts fetches smart bundle counts
func (c *Client) GetBundleCounts() (map[string]int, error) {
	resp, err := c.httpClient.Get(c.baseURL + "/bundles")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var counts map[string]int
	if err := json.NewDecoder(resp.Body).Decode(&counts); err != nil {
		return nil, err
	}
	return counts, nil
}

// GetEmail fetches a single email by ID
func (c *Client) GetEmail(id string) (*types.EmailDetail, error) {
	resp, err := c.httpClient.Get(fmt.Sprintf("%s/emails/%s", c.baseURL, id))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("email not found")
	}

	var email types.EmailDetail
	if err := json.NewDecoder(resp.Body).Decode(&email); err != nil {
		return nil, err
	}
	return &email, nil
}

// SendCompose sends a new email
func (c *Client) SendCompose(req types.ComposeRequest) error {
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/compose",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("compose failed: %s", string(bodyBytes))
	}
	return nil
}

// SendReply sends a reply to an email
func (c *Client) SendReply(req types.ReplyRequest) error {
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/reply",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("reply failed: %s", string(bodyBytes))
	}
	return nil
}

// ToggleStar toggles the starred status of an email
func (c *Client) ToggleStar(emailID string, starred bool) error {
	req := types.StarRequest{
		EmailID: emailID,
		Starred: starred,
	}
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/star",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("star toggle failed")
	}
	return nil
}

// ToggleRead toggles the read status of an email
func (c *Client) ToggleRead(emailID string, read bool) error {
	req := types.ReadRequest{
		EmailID: emailID,
		Read:    read,
	}
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/read",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("read toggle failed")
	}
	return nil
}

// TriggerSync triggers an IMAP sync and returns the result
func (c *Client) TriggerSync() (*types.SyncResponse, error) {
	// Use dedicated client with 5-minute timeout for sync (scoring 1000+ emails takes time)
	syncClient := &http.Client{Timeout: 5 * time.Minute}

	resp, err := syncClient.Post(c.baseURL+"/sync", "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var syncResp types.SyncResponse
	if err := json.NewDecoder(resp.Body).Decode(&syncResp); err != nil {
		return nil, fmt.Errorf("failed to parse sync response: %w", err)
	}

	if !syncResp.Success {
		return &syncResp, fmt.Errorf("sync failed: %s", syncResp.Message)
	}

	return &syncResp, nil
}

// PrioritizeAll triggers bulk AI prioritization for all unprioritized emails
func (c *Client) PrioritizeAll(limit int) error {
	body, _ := json.Marshal(map[string]int{"limit": limit})
	resp, err := c.httpClient.Post(
		c.baseURL+"/ai/prioritize-all",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("prioritization failed: %d", resp.StatusCode)
	}
	return nil
}

// GetQuickReplies fetches AI quick reply suggestions
func (c *Client) GetQuickReplies(emailID string) ([]string, error) {
	body, _ := json.Marshal(map[string]string{"emailId": emailID})
	resp, err := c.httpClient.Post(
		c.baseURL+"/ai/quick-replies",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result types.QuickRepliesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Replies, nil
}

// GetSummary fetches AI email summary
func (c *Client) GetSummary(emailID string) (*types.SummarizeResponse, error) {
	body, _ := json.Marshal(map[string]string{"emailId": emailID})
	resp, err := c.httpClient.Post(
		c.baseURL+"/ai/summarize",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result types.SummarizeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetDraftSuggestions fetches AI draft suggestions for composing/replying
func (c *Client) GetDraftSuggestions(emailID string, context string) ([]string, error) {
	reqBody := map[string]string{"emailId": emailID}
	if context != "" {
		reqBody["context"] = context
	}
	body, _ := json.Marshal(reqBody)

	resp, err := c.httpClient.Post(
		c.baseURL+"/ai/draft-suggest",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result types.DraftSuggestionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Suggestions, nil
}

// ============================================================================
// BULK OPERATION METHODS
// ============================================================================

// BulkToggleRead marks multiple emails as read or unread
func (c *Client) BulkToggleRead(emailIDs []string, read bool) error {
	reqBody := map[string]interface{}{
		"emailIds": emailIDs,
		"read":     read,
	}
	body, _ := json.Marshal(reqBody)

	resp, err := c.httpClient.Post(
		c.baseURL+"/emails/mark-read",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to bulk toggle read status: %d", resp.StatusCode)
	}
	return nil
}

// BulkToggleStar stars or unstars multiple emails
func (c *Client) BulkToggleStar(emailIDs []string, starred bool) error {
	reqBody := map[string]interface{}{
		"emailIds": emailIDs,
		"starred":  starred,
	}
	body, _ := json.Marshal(reqBody)

	resp, err := c.httpClient.Post(
		c.baseURL+"/emails/star",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to bulk toggle star status: %d", resp.StatusCode)
	}
	return nil
}

// BulkDelete deletes multiple emails
func (c *Client) BulkDelete(emailIDs []string) error {
	reqBody := map[string]interface{}{
		"emailIds": emailIDs,
	}
	body, _ := json.Marshal(reqBody)

	resp, err := c.httpClient.Post(
		c.baseURL+"/emails/delete",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to bulk delete emails: %d", resp.StatusCode)
	}
	return nil
}

// BulkArchive archives multiple emails
func (c *Client) BulkArchive(emailIDs []string) error {
	reqBody := map[string]interface{}{
		"emailIds": emailIDs,
	}
	body, _ := json.Marshal(reqBody)

	resp, err := c.httpClient.Post(
		c.baseURL+"/emails/archive",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to bulk archive emails: %d", resp.StatusCode)
	}
	return nil
}
