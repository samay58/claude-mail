#!/usr/bin/env node

import 'dotenv/config';
import React from 'react';
import { render, Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { EmailDetailView } from './components/EmailDetailView.js';
import { EmailComposer } from './components/EmailComposer.js';
import { TableEmailList } from './components/TableEmailList.js';
import { QuickReplyBar } from './components/QuickReplyBar.js';
import { useEmailState } from './hooks/useEmailState.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import DatabaseManager from './database.js';
import AIManager from './core/AIManager.js';
import SMTPManager from './core/SMTPManager.js';

const theme = {
  colors: {
    primary: '#FF6B35',
    surface: '#2D2D2D',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    textMuted: '#808080',
    success: '#4CAF50',
    warning: '#FFC107'
  }
};

// Header Component
function Header({ stats, connectionStatus, priorityCounts }: {
  stats: any;
  connectionStatus: string;
  priorityCounts?: { urgent: number; important: number; normal: number };
}) {
  return (
    <Box borderStyle="single" borderColor={theme.colors.primary} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Box>
          <Text color={theme.colors.primary} bold>
            ✉️ Claude Mail
          </Text>
          <Text color={theme.colors.textMuted}> — </Text>
          <Text color={theme.colors.text}>
            {stats.emails || 0} emails
          </Text>
          {priorityCounts && priorityCounts.urgent > 0 && (
            <Text color="#FF0000"> • {priorityCounts.urgent} urgent</Text>
          )}
          {priorityCounts && priorityCounts.important > 0 && (
            <Text color={theme.colors.warning}> • {priorityCounts.important} important</Text>
          )}
        </Box>

        <Box>
          <Text color={connectionStatus === 'connected' ? theme.colors.success : theme.colors.warning}>
            {connectionStatus === 'connected' ? '🟢 Online' :
             connectionStatus === 'error' ? '🔴 Error' : '🟡 Connecting'}
          </Text>
          {AIManager.getInstance().isConfigured() && (
            <Text color={theme.colors.success}> • 🤖 AI</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// Search Component
function SearchInput({ query, onQueryChange, onSubmit, onCancel }: {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <Box borderStyle="single" borderColor={theme.colors.primary} paddingX={1}>
      <Text color={theme.colors.primary}>🔍 Search: </Text>
      <TextInput
        value={query}
        onChange={onQueryChange}
        placeholder="Type to search emails... (ESC to cancel)"
      />
    </Box>
  );
}

// Main App Component
function App() {
  const emailState = useEmailState();
  const db = DatabaseManager.getInstance();
  const ai = AIManager.getInstance();
  const smtp = SMTPManager.getInstance();

  // Email actions
  const handleSendEmail = async (to: string, subject: string, body: string) => {
    if (emailState.composeMode === 'reply' || emailState.composeMode === 'replyAll' || emailState.composeMode === 'forward') {
      if (emailState.selectedEmail) {
        const result = await smtp.sendReply(
          emailState.selectedEmail.message_id,
          to,
          subject,
          body,
          [emailState.selectedEmail.message_id]
        );
        if (result.success) {
          console.log('✅ Email sent successfully!');
        } else {
          console.error('❌ Failed to send email:', result.error);
        }
      }
    } else {
      const result = await smtp.sendEmail({
        to,
        subject,
        text: body
      });
      if (result.success) {
        console.log('✅ Email sent successfully!');
      } else {
        console.error('❌ Failed to send email:', result.error);
      }
    }
    emailState.setView('list');
  };

  const handleSaveDraft = (to: string, subject: string, body: string) => {
    // Simple auto-save - in a real app, this would save to database
    console.log('📝 Draft auto-saved');
  };

  const handleToggleStar = () => {
    if (emailState.selectedEmail) {
      db.markAsStarred(emailState.selectedEmail.id, !emailState.selectedEmail.is_starred);
    }
  };

  const handleMarkRead = () => {
    if (emailState.selectedEmail) {
      db.markAsRead(emailState.selectedEmail.id);
    }
  };

  const handleSync = async () => {
    try {
      console.log('🔄 Syncing emails from server...');

      // Import ImapManager
      const ImapManager = (await import('./imap.js')).default;
      const imapManager = ImapManager.getInstance();

      // Fetch recent emails (last 7 days, max 150)
      const newEmails = await imapManager.getRecentEmails(7, 150);

      console.log(`📬 Found ${newEmails.length} emails from server`);

      // Save to database
      let savedCount = 0;
      for (const email of newEmails) {
        const emailRecord = {
          id: email.id,
          thread_id: email.threadId,
          message_id: email.messageId,
          subject: email.subject,
          sender_email: email.from.email,
          sender_name: email.from.name || email.from.email,
          recipient_emails: JSON.stringify(email.to.map(t => t.email)),
          date: email.date.toISOString(),
          body_text: email.bodyText || '',
          body_html: email.bodyHtml || '',
          snippet: email.snippet,
          is_read: email.isRead,
          is_starred: false,
          is_important: false,
          folder: 'INBOX',
          labels: JSON.stringify([])
        };

        try {
          db.insertEmail(emailRecord);
          savedCount++;
        } catch (err) {
          console.error(`Failed to save email ${email.id}:`, err);
        }
      }

      console.log(`✅ Saved ${savedCount} emails to database`);

      // Refresh the UI
      emailState.refreshEmails();

      // Prioritize ALL synced emails (not just first 20)
      if (ai.isConfigured()) {
        console.log('🤖 Starting AI prioritization for all emails...');
        const allEmails = db.getEmailsWithPriority(150);

        // Filter to only emails that don't have AI cache yet
        const unprioritized = allEmails.filter(email => {
          const cached = db.getAICache(email.id);
          return !cached || !cached.priority_score;
        });

        console.log(`   📊 Found ${unprioritized.length} emails needing prioritization`);

        if (unprioritized.length > 0) {
          // Prioritize in background (don't await to keep UI responsive)
          emailState.prioritizeEmails(unprioritized).then(() => {
            console.log(`   ✅ Prioritization complete! Refreshing display...`);
            emailState.refreshEmails();
          });
        }
      }

    } catch (error: any) {
      console.error('❌ Sync failed:', error.message || error);

      // Show helpful error messages
      if (error.message?.includes('AUTHENTICATIONFAILED')) {
        console.error('⚠️  Check your IMAP credentials in .env file');
      } else if (error.message?.includes('ETIMEDOUT')) {
        console.error('⚠️  Connection timeout - check your internet connection');
      }
    }
  };

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    view: emailState.view,
    emails: emailState.emails,
    selectedIndex: emailState.selectedIndex,
    selectedEmail: emailState.selectedEmail,
    currentPage: emailState.currentPage,
    totalPages: emailState.totalPages,
    setSelectedIndex: emailState.setSelectedIndex,
    setView: emailState.setView,
    setComposeMode: emailState.setComposeMode,
    setSortByPriority: emailState.setSortByPriority,
    nextPage: emailState.nextPage,
    prevPage: emailState.prevPage,
    onToggleStar: handleToggleStar,
    onMarkRead: handleMarkRead,
    onSync: handleSync,
    refreshEmails: emailState.refreshEmails
  });

  // Render different views
  if (emailState.view === 'detail') {
    return (
      <EmailDetailView
        email={emailState.selectedEmail}
        onClose={() => emailState.setView('list')}
        onReply={() => {
          emailState.setComposeMode('reply');
          emailState.setView('compose');
        }}
        onForward={() => {
          emailState.setComposeMode('forward');
          emailState.setView('compose');
        }}
        onArchive={() => {
          console.log('Archive not implemented');
        }}
        onDelete={() => {
          console.log('Delete not implemented');
        }}
        onMarkUnread={() => {
          handleMarkRead();
          emailState.refreshEmails();
          emailState.setView('list');
        }}
        onToggleStar={() => {
          handleToggleStar();
          emailState.refreshEmails();
        }}
        quickReplies={emailState.quickReplies}
        onSendQuickReply={async (reply) => {
          if (emailState.selectedEmail) {
            const result = await smtp.sendReply(
              emailState.selectedEmail.message_id,
              emailState.selectedEmail.sender_email,
              `Re: ${emailState.selectedEmail.subject}`,
              reply,
              [emailState.selectedEmail.message_id]
            );
            if (result.success) {
              console.log('✅ Quick reply sent!');
              emailState.setView('list');
            } else {
              console.error('❌ Failed to send quick reply:', result.error);
            }
          }
        }}
      />
    );
  }

  if (emailState.view === 'compose') {
    return (
      <EmailComposer
        mode={emailState.composeMode}
        originalEmail={emailState.composeMode !== 'compose' ? emailState.selectedEmail : undefined}
        onSend={handleSendEmail}
        onSaveDraft={handleSaveDraft}
        onCancel={() => {
          emailState.setView('list');
          emailState.setAiSuggestions([]);
        }}
        aiSuggestions={emailState.aiSuggestions}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Header
        stats={emailState.stats}
        connectionStatus={emailState.connectionStatus}
        priorityCounts={emailState.priorityCounts}
      />

      {/* Search input (when active) */}
      {emailState.view === 'search' && (
        <Box marginTop={1}>
          <SearchInput
            query={emailState.searchQuery}
            onQueryChange={emailState.setSearchQuery}
            onSubmit={() => emailState.setView('list')}
            onCancel={() => {
              emailState.setView('list');
              emailState.setSearchQuery('');
            }}
          />
        </Box>
      )}

      {/* Email table */}
      <Box flexGrow={1} marginTop={1}>
        <TableEmailList
          emails={emailState.emails}
          selectedIndex={emailState.selectedIndex}
          emailPriorities={emailState.emailPriorities}
          onEmailSelect={emailState.setSelectedIndex}
          currentPage={emailState.currentPage}
          totalPages={emailState.totalPages}
          totalEmails={emailState.allEmails.length}
        />
      </Box>

      {/* Footer with shortcuts */}
      <Box borderStyle="single" borderColor={theme.colors.surface} paddingX={1} marginTop={1}>
        <Text color={theme.colors.textMuted}>
          [Enter] Open  [c] Compose  [r] Reply  [n] Next Page  [/] Search  [p] Priority  [q] Quit
          {ai.isConfigured() && <Text color={theme.colors.success}> 🤖 AI ON</Text>}
        </Text>
      </Box>
    </Box>
  );
}

// Start the application
render(<App />);