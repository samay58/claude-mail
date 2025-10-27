import React from 'react';
import { Box, Text } from 'ink';
import { EmailRecord } from '../database.js';
import { TableEmailRow } from './TableEmailRow.js';

interface TableEmailListProps {
  emails: Array<EmailRecord & { priority_score?: number; priority_category?: string }>;
  selectedIndex: number;
  emailPriorities: Map<string, any>;
  onEmailSelect: (index: number) => void;
}

const theme = {
  colors: {
    primary: '#FF6B35',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    textMuted: '#808080',
    border: '#404040',
    headerBg: '#1A1A1A'
  }
};

export function TableEmailList({ emails, selectedIndex, emailPriorities, onEmailSelect }: TableEmailListProps) {
  if (emails.length === 0) {
    return (
      <Box borderStyle="single" borderColor={theme.colors.border} paddingX={2} paddingY={1} justifyContent="center">
        <Text color={theme.colors.textMuted}>No emails to display</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.colors.primary}>
      {/* Table Header */}
      <Box paddingX={1} borderColor={theme.colors.border} borderStyle="single">
        <Text color={theme.colors.primary} bold>
          📥 Inbox ({emails.length} emails)
        </Text>
      </Box>

      {/* Column Headers */}
      <Box paddingX={1} borderBottom borderColor={theme.colors.border}>
        <Text color={theme.colors.textSecondary} bold>
          <Text>Sel </Text>
          <Text>Pri  </Text>
          <Text>Sender   </Text>
          <Text>Subject                  </Text>
          <Text>Time </Text>
          <Text>Tags </Text>
          <Text>St</Text>
        </Text>
      </Box>

      {/* Divider line */}
      <Box paddingX={1}>
        <Text color={theme.colors.border}>
          {'───┼────┼────────┼─────────────────────────┼─────┼─────┼──'}
        </Text>
      </Box>

      {/* Email Rows */}
      <Box flexDirection="column">
        {emails.map((email, index) => (
          <TableEmailRow
            key={email.id}
            email={email}
            isSelected={index === selectedIndex}
            index={index}
            priorityData={emailPriorities.get(email.id)}
          />
        ))}
      </Box>

      {/* Footer with summary */}
      <Box paddingX={1} paddingY={0} borderTop borderColor={theme.colors.border}>
        <Text color={theme.colors.textMuted}>
          {selectedIndex + 1} of {emails.length} selected
        </Text>

        {/* Priority summary */}
        {(() => {
          const priorityCounts = { urgent: 0, important: 0, normal: 0 };
          emails.forEach(email => {
            const priority = emailPriorities.get(email.id);
            const score = priority?.score || email.priority_score || 50;
            if (score >= 90) priorityCounts.urgent++;
            else if (score >= 70) priorityCounts.important++;
            else priorityCounts.normal++;
          });

          return (
            <Text>
              {priorityCounts.urgent > 0 && (
                <Text color="#FF0000"> • {priorityCounts.urgent} urgent</Text>
              )}
              {priorityCounts.important > 0 && (
                <Text color="#FF6B35"> • {priorityCounts.important} important</Text>
              )}
              <Text color="#4CAF50"> • {priorityCounts.normal} normal</Text>
            </Text>
          );
        })()}
      </Box>
    </Box>
  );
}

// Alternative minimal table header (for smaller terminals)
export function CompactTableEmailList({ emails, selectedIndex, emailPriorities, onEmailSelect }: TableEmailListProps) {
  if (emails.length === 0) {
    return (
      <Box borderStyle="single" borderColor={theme.colors.border} paddingX={2} paddingY={1} justifyContent="center">
        <Text color={theme.colors.textMuted}>No emails to display</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Compact Header */}
      <Box paddingX={1}>
        <Text color={theme.colors.primary} bold>
          📥 Inbox ({emails.length})
        </Text>
      </Box>

      {/* Email Rows without borders for compact view */}
      <Box flexDirection="column">
        {emails.map((email, index) => (
          <TableEmailRow
            key={email.id}
            email={email}
            isSelected={index === selectedIndex}
            index={index}
            priorityData={emailPriorities.get(email.id)}
          />
        ))}
      </Box>
    </Box>
  );
}