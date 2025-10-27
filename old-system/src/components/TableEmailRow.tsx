import React from 'react';
import { Box, Text } from 'ink';
import { EmailRecord } from '../database.js';
import { getFixedBadgeData } from './FixedEmailBadges.js';

interface TableEmailRowProps {
  email: EmailRecord & { priority_score?: number; priority_category?: string };
  isSelected: boolean;
  index: number;
  priorityData?: { score: number; category: string };
}

const theme = {
  colors: {
    primary: '#FF6B35',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    textMuted: '#808080',
    selected: '#2D2D2D',
    border: '#404040'
  }
};

// Helper functions for fixed-width formatting
const formatDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const padRight = (text: string, length: number): string => {
  return text.length >= length ? text.substring(0, length) : text + ' '.repeat(length - text.length);
};

const truncate = (text: string, length: number): string => {
  return text.length > length ? text.substring(0, length - 3) + '...' : text;
};

export function TableEmailRow({ email, isSelected, index, priorityData }: TableEmailRowProps) {
  const senderName = email.sender_name || email.sender_email;
  const date = formatDate(new Date(email.date));
  const isUnread = !email.is_read;

  const priority = {
    score: priorityData?.score || email.priority_score || 50,
    category: (priorityData?.category || email.priority_category || 'normal') as any
  };

  // Get badge data
  const badgeData = getFixedBadgeData(email, priority);

  // Format each column to exact width
  const selectionCol = isSelected ? ' ▶ ' : '   '; // 3 chars
  const priorityCol = padRight(badgeData.priority, 5); // 5 chars (🔴85 + space)
  const senderCol = padRight(truncate(senderName, 8), 8); // 8 chars
  const subjectCol = padRight(truncate(email.subject, 22), 25); // 25 chars (22 + '...')
  const timeCol = padRight(date, 4); // 4 chars
  const tagCol = padRight(badgeData.tag, 4); // 4 chars (3 letters + space)
  const starCol = email.is_starred ? '★ ' : '  '; // 2 chars

  // Color scheme
  const textColor = isSelected ? theme.colors.primary : (isUnread ? theme.colors.text : theme.colors.textSecondary);
  const senderColor = isSelected ? theme.colors.primary : theme.colors.textSecondary;

  return (
    <Box>
      <Text>
        {/* Selection indicator - 3 chars */}
        <Text color={isSelected ? theme.colors.primary : 'transparent'}>
          {selectionCol}
        </Text>

        {/* Priority badge - 5 chars */}
        <Text color={badgeData.priorityColor}>
          {priorityCol}
        </Text>

        {/* Sender - 8 chars */}
        <Text color={senderColor} bold={isUnread}>
          {senderCol}
        </Text>

        {/* Subject - 25 chars */}
        <Text color={textColor} bold={isUnread}>
          {subjectCol}
        </Text>

        {/* Time - 4 chars */}
        <Text color={theme.colors.textMuted}>
          {timeCol}
        </Text>

        {/* Tag - 4 chars */}
        <Text color={badgeData.tagColor || theme.colors.textMuted}>
          {tagCol}
        </Text>

        {/* Star - 2 chars */}
        <Text color="#FFD700">
          {starCol}
        </Text>
      </Text>
    </Box>
  );
}

// Header row for the table
export function TableEmailHeader() {
  return (
    <Box borderStyle="single" borderColor={theme.colors.border}>
      <Text color={theme.colors.textSecondary} bold>
        {'Sel Pri  Sender   Subject                  Time Tags Star'}
      </Text>
    </Box>
  );
}