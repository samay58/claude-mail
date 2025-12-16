import React from 'react';
import { Text } from 'ink';

interface FixedEmailBadgesProps {
  email: {
    subject: string;
    body_text?: string;
    snippet?: string;
    sender_email: string;
    is_important?: boolean;
  };
  priority: {
    score: number;
    category: 'urgent' | 'important' | 'normal' | 'low' | 'spam';
    suggestedAction?: string;
  };
}

const categoryColors = {
  urgent: '#FF0000',
  important: '#FF6B35',
  normal: '#4CAF50',
  low: '#808080',
  spam: '#404040'
};

const categoryIcons = {
  urgent: '🔴',
  important: '🟠',
  normal: '🟢',
  low: '⚫',
  spam: '🗑️'
};

// 3-letter tag codes for consistent width
const tagCodes = {
  ACTION: 'ACT',
  MEETING: 'MTG',
  QUESTION: 'QUE',
  INVOICE: 'INV',
  SECURITY: 'SEC',
  FYI: 'FYI'
};

const tagColors = {
  ACT: '#FF6B35',
  MTG: '#9B59B6',
  QUE: '#3498DB',
  INV: '#E74C3C',
  SEC: '#E91E63',
  FYI: '#95A5A6'
};

export function FixedEmailBadges({ email, priority }: FixedEmailBadgesProps) {
  // Fixed priority badge: always 4 characters (icon + 2-digit number)
  const priorityColor = categoryColors[priority.category] || categoryColors.normal;
  const priorityIcon = categoryIcons[priority.category] || categoryIcons.normal;
  const displayScore = priority.score || 50;
  const formattedScore = displayScore.toString().padStart(2, '0');

  // Content analysis for tags
  const subject = email.subject.toLowerCase();
  const body = (email.body_text || email.snippet || '').toLowerCase();
  const fullText = subject + ' ' + body;

  // Determine single tag (3 letters) - only one tag for consistency
  let tag = '';
  let tagColor = '';

  if (priority.score >= 70 && priority.suggestedAction) {
    tag = tagCodes.ACTION;
    tagColor = tagColors.ACT;
  } else if (fullText.includes('meeting') || fullText.includes('calendar') || fullText.includes('invitation')) {
    tag = tagCodes.MEETING;
    tagColor = tagColors.MTG;
  } else if (fullText.includes('?') || fullText.includes('question') || fullText.includes('wondering')) {
    tag = tagCodes.QUESTION;
    tagColor = tagColors.QUE;
  } else if (fullText.includes('invoice') || fullText.includes('payment') || fullText.includes('billing')) {
    tag = tagCodes.INVOICE;
    tagColor = tagColors.INV;
  } else if (email.sender_email.includes('security') || fullText.includes('security alert')) {
    tag = tagCodes.SECURITY;
    tagColor = tagColors.SEC;
  } else if (fullText.includes('fyi') || fullText.includes('for your information')) {
    tag = tagCodes.FYI;
    tagColor = tagColors.FYI;
  }

  return {
    // Priority badge: exactly 4 characters
    priorityBadge: (
      <Text color={priorityColor} bold>
        {priorityIcon}{formattedScore}
      </Text>
    ),
    // Tag: exactly 3 characters (or empty string)
    tag,
    tagColor,
    // For table display - formatted strings
    priorityText: `${priorityIcon}${formattedScore}`,
    tagText: tag || '   ' // 3 spaces if no tag
  };
}

// Helper function for table row rendering
export function getFixedBadgeData(email: any, priority: any) {
  const badges = FixedEmailBadges({ email, priority });
  return {
    priority: badges.priorityText, // 4 chars
    tag: badges.tagText,          // 3 chars
    priorityColor: categoryColors[priority.category as keyof typeof categoryColors] || categoryColors.normal,
    tagColor: badges.tagColor || '#808080'
  };
}