import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { EmailRecord } from '../database.js';

interface EmailComposerProps {
  mode: 'compose' | 'reply' | 'replyAll' | 'forward';
  originalEmail?: EmailRecord;
  onSend: (to: string, subject: string, body: string) => void;
  onSaveDraft: (to: string, subject: string, body: string) => void;
  onCancel: () => void;
  aiSuggestions?: string[];
}

type ComposerField = 'to' | 'subject' | 'body';

const theme = {
  colors: {
    primary: '#FF6B35',
    surface: '#2D2D2D',
    text: '#FFFFFF',
    textSecondary: '#B8B8B8',
    textMuted: '#808080',
    success: '#4CAF50',
    warning: '#FFC107',
    error: '#F44336'
  }
};

export function EmailComposer({
  mode,
  originalEmail,
  onSend,
  onSaveDraft,
  onCancel,
  aiSuggestions = []
}: EmailComposerProps) {
  const [activeField, setActiveField] = useState<ComposerField>('to');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Initialize fields based on mode and original email
  useEffect(() => {
    if (originalEmail) {
      switch (mode) {
        case 'reply':
          setTo(originalEmail.sender_email);
          setSubject(`Re: ${originalEmail.subject.replace(/^Re:\s*/i, '')}`);
          break;
        case 'replyAll':
          const recipients = JSON.parse(originalEmail.recipient_emails || '[]');
          setTo([originalEmail.sender_email, ...recipients].join(', '));
          setSubject(`Re: ${originalEmail.subject.replace(/^Re:\s*/i, '')}`);
          break;
        case 'forward':
          setSubject(`Fwd: ${originalEmail.subject.replace(/^Fwd:\s*/i, '')}`);
          setBody(`\n\n---------- Forwarded message ----------\nFrom: ${originalEmail.sender_name || originalEmail.sender_email}\nDate: ${new Date(originalEmail.date).toLocaleDateString()}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body_text}`);
          break;
      }
    }
  }, [mode, originalEmail]);

  // Show AI suggestions when available and composing body
  useEffect(() => {
    if (aiSuggestions.length > 0 && activeField === 'body') {
      setShowSuggestions(true);
      setSelectedSuggestion(0);
    }
  }, [aiSuggestions, activeField]);

  useInput((input, key) => {
    if (key.escape) {
      if (showSuggestions) {
        setShowSuggestions(false);
      } else {
        onCancel();
      }
      return;
    }

    // Handle AI suggestions
    if (showSuggestions) {
      if (key.upArrow) {
        setSelectedSuggestion(Math.max(0, selectedSuggestion - 1));
      } else if (key.downArrow) {
        setSelectedSuggestion(Math.min(aiSuggestions.length - 1, selectedSuggestion + 1));
      } else if (key.return) {
        setBody(aiSuggestions[selectedSuggestion]);
        setShowSuggestions(false);
      } else if (key.tab) {
        // Cycle through suggestions with Tab
        setSelectedSuggestion((selectedSuggestion + 1) % aiSuggestions.length);
      }
      return;
    }

    // Field navigation
    if (key.tab) {
      const fields: ComposerField[] = ['to', 'subject', 'body'];
      const currentIndex = fields.indexOf(activeField);
      const nextIndex = key.shift ?
        (currentIndex === 0 ? fields.length - 1 : currentIndex - 1) :
        (currentIndex + 1) % fields.length;
      setActiveField(fields[nextIndex]);
    }

    // Commands
    if (key.ctrl) {
      if (input === 's') {
        // Ctrl+S - Send
        if (to && subject && body) {
          onSend(to, subject, body);
        }
      } else if (input === 'd') {
        // Ctrl+D - Save draft
        onSaveDraft(to, subject, body);
      }
    }
  });

  const renderField = (
    field: ComposerField,
    label: string,
    value: string,
    setValue: (v: string) => void,
    placeholder: string
  ) => {
    const isActive = activeField === field;

    return (
      <Box marginBottom={1}>
        <Text color={theme.colors.textSecondary}>
          {label}:
          {isActive && <Text color={theme.colors.primary}> ●</Text>}
        </Text>
        <Box marginLeft={2}>
          {isActive ? (
            <TextInput
              value={value}
              onChange={setValue}
              placeholder={placeholder}
            />
          ) : (
            <Text color={value ? theme.colors.text : theme.colors.textMuted}>
              {value || placeholder}
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  const wordCount = body.split(/\s+/).filter(word => word.length > 0).length;

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" borderStyle="double" borderColor={theme.colors.primary}>
        {/* Header */}
        <Box borderStyle="single" borderColor={theme.colors.surface} paddingX={1}>
          <Text color={theme.colors.primary} bold>
            ✉️ {mode === 'compose' ? 'Compose Email' :
                 mode === 'reply' ? 'Reply' :
                 mode === 'replyAll' ? 'Reply All' :
                 'Forward'}
          </Text>
        </Box>

        {/* Fields */}
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          {renderField('to', 'To', to, setTo, 'recipient@example.com')}
          {renderField('subject', 'Subject', subject, setSubject, 'Email subject')}

          {/* Body field with word count */}
          <Box marginBottom={1}>
            <Text color={theme.colors.textSecondary}>
              Message:
              {activeField === 'body' && <Text color={theme.colors.primary}> ●</Text>}
            </Text>
            <Text color={theme.colors.textMuted}> ({wordCount} words)</Text>
          </Box>
          <Box
            borderStyle={activeField === 'body' ? 'double' : 'single'}
            borderColor={activeField === 'body' ? theme.colors.primary : theme.colors.surface}
            paddingX={1}
            marginTop={1}
            minHeight={6}
          >
            {activeField === 'body' ? (
              <TextInput
                value={body}
                onChange={setBody}
                placeholder="Type your message..."
              />
            ) : (
              <Text color={body ? theme.colors.text : theme.colors.textMuted}>
                {body || 'Type your message...'}
              </Text>
            )}
          </Box>

          {/* AI Suggestions */}
          {showSuggestions && aiSuggestions.length > 0 && (
            <Box borderStyle="single" borderColor={theme.colors.warning} paddingX={1} marginTop={1}>
              <Box flexDirection="column">
                <Text color={theme.colors.warning} bold>
                  🤖 AI Suggestions (Tab to cycle):
                </Text>
                {aiSuggestions.map((suggestion, i) => (
                  <Box key={i} marginTop={1}>
                    <Text color={i === selectedSuggestion ? theme.colors.primary : theme.colors.textSecondary}>
                      {i === selectedSuggestion ? '▶' : ' '} {i + 1}. {suggestion.substring(0, 60)}...
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Status */}
          <Box marginTop={1}>
            {to && subject && body ? (
              <Text color={theme.colors.success}>✓ Ready to send</Text>
            ) : (
              <Text color={theme.colors.textMuted}>
                Fill in: {[!to && 'recipient', !subject && 'subject', !body && 'message'].filter(Boolean).join(', ')}
              </Text>
            )}
          </Box>
        </Box>

        {/* Action bar */}
        <Box borderStyle="single" borderColor={theme.colors.surface} paddingX={1}>
          <Text color={theme.colors.textMuted}>
            [Ctrl+S] Send  [Ctrl+D] Draft  [Tab] Navigate  {aiSuggestions.length > 0 && '[Tab] Cycle AI  '}[ESC] Cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}