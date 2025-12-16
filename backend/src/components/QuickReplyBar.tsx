import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface QuickReplyBarProps {
  replies: string[];
  onSelect: (reply: string) => void;
  onGenerateMore?: () => void;
  isGenerating?: boolean;
}

const theme = {
  colors: {
    primary: '#FF6B35',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    textMuted: '#808080',
    success: '#4CAF50'
  }
};

export function QuickReplyBar({
  replies,
  onSelect,
  onGenerateMore,
  isGenerating = false
}: QuickReplyBarProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useInput((input, key) => {
    // Number keys for quick selection
    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= replies.length) {
      onSelect(replies[num - 1]);
      return;
    }

    // Navigation
    if (key.leftArrow) {
      setHighlightedIndex(Math.max(0, highlightedIndex - 1));
    } else if (key.rightArrow) {
      setHighlightedIndex(Math.min(replies.length - 1, highlightedIndex + 1));
    } else if (key.return) {
      if (replies[highlightedIndex]) {
        onSelect(replies[highlightedIndex]);
      }
    } else if (input === 'g' && onGenerateMore && !isGenerating) {
      onGenerateMore();
    }
  });

  if (replies.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.primary} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          ⚡ Quick Replies
        </Text>
        {isGenerating && (
          <Text color={theme.colors.textMuted}> (generating...)</Text>
        )}
      </Box>

      {replies.length > 0 && (
        <Box flexDirection="column">
          {replies.slice(0, 3).map((reply, index) => {
            const isHighlighted = index === highlightedIndex;
            const truncated = reply.length > 50 ? reply.substring(0, 50) + '...' : reply;

            return (
              <Box key={index} marginBottom={index < replies.length - 1 ? 1 : 0}>
                <Text color={isHighlighted ? theme.colors.success : theme.colors.textSecondary}>
                  [{index + 1}]
                </Text>
                <Text color={isHighlighted ? theme.colors.text : theme.colors.textMuted}>
                  {' '}
                  {isHighlighted ? '▶ ' : '  '}
                  {truncated}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.colors.textMuted} dimColor>
          Press 1-3 to send • ← → to navigate • Enter to select
          {onGenerateMore && ' • [g] Generate more'}
        </Text>
      </Box>
    </Box>
  );
}