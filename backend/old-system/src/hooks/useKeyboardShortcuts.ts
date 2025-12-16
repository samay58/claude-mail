import { useInput, useApp } from 'ink';
import { View, ComposeMode } from './useEmailState.js';

interface UseKeyboardShortcutsProps {
  view: View;
  emails: any[];
  selectedIndex: number;
  selectedEmail: any;
  setSelectedIndex: (index: number) => void;
  setView: (view: View) => void;
  setComposeMode: (mode: ComposeMode) => void;
  setSortByPriority: (sort: boolean) => void;
  onToggleStar: () => void;
  onMarkRead: () => void;
  onSync: () => void;
  refreshEmails: () => void;
}

export function useKeyboardShortcuts({
  view,
  emails,
  selectedIndex,
  selectedEmail,
  setSelectedIndex,
  setView,
  setComposeMode,
  setSortByPriority,
  onToggleStar,
  onMarkRead,
  onSync,
  refreshEmails
}: UseKeyboardShortcutsProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    // Handle different views
    if (view === 'detail' || view === 'compose') {
      // Let the detail/compose components handle their own input
      return;
    }

    if (view === 'search') {
      if (key.escape) {
        setView('list');
      }
      return; // Let TextInput handle other keys
    }

    // List view navigation
    if (input === 'j' || key.downArrow) {
      setSelectedIndex(Math.min(emails.length - 1, selectedIndex + 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }

    // Vim-style navigation
    if (input === 'g') {
      setSelectedIndex(0); // Go to top
      return;
    }
    if (input === 'G') {
      setSelectedIndex(emails.length - 1); // Go to bottom
      return;
    }

    // Page navigation
    if (key.pageDown || input === ' ') {
      setSelectedIndex(Math.min(emails.length - 1, selectedIndex + 10));
      return;
    }
    if (key.pageUp) {
      setSelectedIndex(Math.max(0, selectedIndex - 10));
      return;
    }

    // Action keys
    if (key.return) {
      // Enter key - open email detail view
      if (selectedEmail) {
        setView('detail');
      }
      return;
    }

    // Handle single key commands
    switch (input.toLowerCase()) {
      case 'q':
        // Quit
        exit();
        break;
      case '/':
        setView('search');
        setSelectedIndex(0);
        break;
      case 'c':
        // Compose new email
        setComposeMode('compose');
        setView('compose');
        break;
      case 'r':
        // Reply to email
        if (selectedEmail) {
          setComposeMode('reply');
          setView('compose');
        }
        break;
      case 'f':
        // Forward email
        if (selectedEmail) {
          setComposeMode('forward');
          setView('compose');
        }
        break;
      case 'm':
        // Mark as read/unread toggle
        if (selectedEmail) {
          onMarkRead();
          refreshEmails();
        }
        break;
      case 't':
        // Star/unstar toggle
        if (selectedEmail) {
          onToggleStar();
          refreshEmails();
        }
        break;
      case 'p':
        // Toggle priority sort
        setSortByPriority(true); // Simplified - always sort by priority when pressed
        break;
      case 's':
        // Sync emails
        onSync();
        break;
    }

    // Handle capital letters (Shift+key)
    switch (input) {
      case 'R':
        // Reply all
        if (selectedEmail) {
          setComposeMode('replyAll');
          setView('compose');
        }
        break;
    }
  });
}