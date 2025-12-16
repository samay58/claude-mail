import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { EmailRecord } from '../database.js';
import { QuickReplyBar } from './QuickReplyBar.js';

interface EmailDetailViewProps {
  email: EmailRecord;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  quickReplies?: string[];
  onSendQuickReply?: (reply: string) => void;
}

const theme = {
  colors: {
    primary: '#FF6B35',
    surface: '#2D2D2D',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    textMuted: '#808080',
    warning: '#FFC107',
    error: '#F44336',
    success: '#4CAF50'
  }
};

export function EmailDetailView({
  email,
  onClose,
  onReply,
  onForward,
  onArchive,
  onDelete,
  onMarkUnread,
  onToggleStar,
  quickReplies = [],
  onSendQuickReply
}: EmailDetailViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Parse email body for display
  const bodyLines = (email.body_text || email.snippet || 'No content available')
    .split('\n')
    .map(line => line.length > 100 ? line.match(/.{1,100}/g) || [line] : [line])
    .flat();

  const visibleLines = 30; // Number of lines to show at once
  const maxScroll = Math.max(0, bodyLines.length - visibleLines);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onClose();
    } else if (input === 'r') {
      onReply();
    } else if (input === 'f') {
      onForward();
    } else if (input === 'a') {
      onArchive();
    } else if (input === 'd') {
      onDelete();
    } else if (input === 'u') {
      onMarkUnread();
    } else if (input === 's' || input === 't') {
      onToggleStar();
    } else if (input === 'j' || key.downArrow) {
      setScrollOffset(Math.min(maxScroll, scrollOffset + 1));
    } else if (input === 'k' || key.upArrow) {
      setScrollOffset(Math.max(0, scrollOffset - 1));
    } else if (key.pageDown || input === ' ') {
      setScrollOffset(Math.min(maxScroll, scrollOffset + visibleLines));
    } else if (key.pageUp) {
      setScrollOffset(Math.max(0, scrollOffset - visibleLines));
    } else if (input === 'g') {
      // gg - go to top (would need double-g detection)
      setScrollOffset(0);
    } else if (input === 'G') {
      // G - go to bottom
      setScrollOffset(maxScroll);
    }
  });

  const date = new Date(email.date);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Extract recipients if available
  const recipients = email.recipient_emails ?
    JSON.parse(email.recipient_emails).join(', ') :
    'Unknown';

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.colors.primary}>
      {/* Header Bar */}
      <Box
        borderStyle="single"
        borderColor={theme.colors.surface}
        paddingX={1}
        paddingY={0}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={theme.colors.primary} bold>
            📧 Email Details
          </Text>
          <Text color={theme.colors.textMuted}>
            [ESC/q] Close
          </Text>
        </Box>
      </Box>

      {/* Email Metadata */}
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text color={theme.colors.text} bold wrap="wrap">
            {email.subject}
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text>
              <Text color={theme.colors.textSecondary}>From: </Text>
              <Text color={theme.colors.text}>
                {email.sender_name || email.sender_email}
              </Text>
              {email.sender_name && (
                <Text color={theme.colors.textMuted}> &lt;{email.sender_email}&gt;</Text>
              )}
            </Text>
          </Box>

          <Box>
            <Text>
              <Text color={theme.colors.textSecondary}>To: </Text>
              <Text color={theme.colors.text}>{recipients}</Text>
            </Text>
          </Box>

          <Box>
            <Text>
              <Text color={theme.colors.textSecondary}>Date: </Text>
              <Text color={theme.colors.text}>{formattedDate}</Text>
            </Text>
          </Box>

          {/* Status indicators */}
          {(email.is_starred || email.is_important || !email.is_read) && (
            <Box marginTop={1}>
              <Text>
                {email.is_starred && <Text color="#FFD700">★ Starred  </Text>}
                {email.is_important && <Text color={theme.colors.error}>! Important  </Text>}
                {!email.is_read && <Text color={theme.colors.warning}>● Unread  </Text>}
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Separator */}
      <Box borderStyle="single" borderColor={theme.colors.surface} />

      {/* Quick Replies (if available) */}
      {quickReplies.length > 0 && onSendQuickReply && (
        <Box marginY={1}>
          <QuickReplyBar
            replies={quickReplies}
            onSelect={onSendQuickReply}
          />
        </Box>
      )}

      {/* Email Body with Scrolling */}
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        height={visibleLines}
      >
        {bodyLines
          .slice(scrollOffset, scrollOffset + visibleLines)
          .map((line, i) => (
            <Text key={i} color={theme.colors.text} wrap="wrap">
              {line || ' '}
            </Text>
          ))}

        {/* Scroll indicator */}
        {bodyLines.length > visibleLines && (
          <Box marginTop={1}>
            <Text color={theme.colors.textMuted}>
              Lines {scrollOffset + 1}-{Math.min(scrollOffset + visibleLines, bodyLines.length)} of {bodyLines.length}
              {scrollOffset > 0 ? ' ↑' : ''}
              {scrollOffset < maxScroll ? ' ↓' : ''}
            </Text>
          </Box>
        )}
      </Box>

      {/* Action Bar */}
      <Box
        borderStyle="single"
        borderColor={theme.colors.surface}
        paddingX={1}
        paddingY={0}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={theme.colors.textMuted}>
            [r] Reply  [f] Forward  [a] Archive  [d] Delete
          </Text>
          <Text color={theme.colors.textMuted}>
            [u] Mark Unread  [s] Star  [j/k] Scroll
          </Text>
        </Box>
      </Box>
    </Box>
  );
}