import { useState, useEffect, useMemo } from 'react';
import DatabaseManager, { EmailRecord } from '../database.js';
import AIManager from '../core/AIManager.js';

export type View = 'list' | 'search' | 'detail' | 'compose';
export type ComposeMode = 'compose' | 'reply' | 'replyAll' | 'forward';

export function useEmailState() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<View>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [composeMode, setComposeMode] = useState<ComposeMode>('compose');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [emailPriorities, setEmailPriorities] = useState<Map<string, any>>(new Map());
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [sortByPriority, setSortByPriority] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [emailsPerPage] = useState(15); // Fixed page size for terminal visibility

  const [stats, setStats] = useState({ emails: 0, unread: 0, contacts: 0 });
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const db = DatabaseManager.getInstance();
  const ai = AIManager.getInstance();

  // Load initial data and prioritize emails
  useEffect(() => {
    try {
      const allEmails = db.getEmailsWithPriority(100);
      setEmails(allEmails);
      setStats(db.getStats());
      setConnectionStatus('connected');

      // Start prioritizing emails in the background
      if (ai.isConfigured()) {
        prioritizeEmails(allEmails.slice(0, 20)); // Prioritize first 20
      }
    } catch (error) {
      console.error('Failed to load emails:', error);
      setConnectionStatus('error');
    }
  }, []);

  // Prioritize emails with AI
  const prioritizeEmails = async (emailsToProcess: EmailRecord[]) => {
    for (const email of emailsToProcess) {
      // Check if already cached
      const cached = db.getAICache(email.id);
      if (cached && cached.priority_score) {
        setEmailPriorities(prev => new Map(prev).set(email.id, {
          score: cached.priority_score,
          category: cached.priority_category
        }));
        continue;
      }

      // Get priority from AI
      try {
        const priority = await ai.prioritizeEmail(email);
        if (priority) {
          setEmailPriorities(prev => new Map(prev).set(email.id, priority));

          // Cache the result
          db.setAICache(email.id, {
            priority_score: priority.score,
            priority_category: priority.category,
            quick_replies: '[]',
            draft_suggestions: '[]'
          });
        }
      } catch (error) {
        console.error(`Failed to prioritize email ${email.id}:`, error);
      }
    }
  };

  // Generate AI suggestions for compose mode
  useEffect(() => {
    if (view === 'compose' && composeMode !== 'compose' && selectedEmail && ai.isConfigured()) {
      ai.generateDraftSuggestions(selectedEmail, composeMode as any)
        .then(suggestions => {
          setAiSuggestions(suggestions.map(s => s.body));
        })
        .catch(err => console.error('Error generating suggestions:', err));
    }
  }, [view, composeMode]);

  // Generate quick replies when viewing an email
  const generateQuickReplies = async (email: EmailRecord) => {
    if (!ai.isConfigured()) {
      setQuickReplies([
        "Thank you for your email. I'll get back to you soon.",
        "Received, thanks!",
        "I'll review this and respond shortly."
      ]);
      return;
    }

    // TODO: Implement AI quick reply generation
    setQuickReplies([
      "Thank you for your email. I'll get back to you soon.",
      "Received, thanks!",
      "I'll review this and respond shortly."
    ]);
  };

  // Filter and paginate emails
  const { filteredEmails, totalPages, displayEmails } = useMemo(() => {
    let filtered = emails;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = emails.filter(email =>
        email.subject.toLowerCase().includes(query) ||
        email.sender_email.toLowerCase().includes(query) ||
        (email.sender_name?.toLowerCase().includes(query)) ||
        (email.body_text?.toLowerCase().includes(query))
      );
    }

    // Sort by priority if enabled
    if (sortByPriority) {
      filtered = [...filtered].sort((a, b) => {
        const priorityA = emailPriorities.get(a.id)?.score || 50;
        const priorityB = emailPriorities.get(b.id)?.score || 50;
        return priorityB - priorityA;
      });
    }

    // Calculate pagination
    const totalPages = Math.ceil(filtered.length / emailsPerPage);
    const startIndex = currentPage * emailsPerPage;
    const endIndex = startIndex + emailsPerPage;
    const displayEmails = filtered.slice(startIndex, endIndex);

    return {
      filteredEmails: filtered,
      totalPages,
      displayEmails
    };
  }, [emails, searchQuery, emailPriorities, sortByPriority, currentPage, emailsPerPage]);

  // Get selected email (from displayEmails, not filteredEmails)
  const selectedEmail = displayEmails[selectedIndex] || null;

  // Priority counts for header
  const priorityCounts = useMemo(() => {
    const counts = { urgent: 0, important: 0, normal: 0 };
    emails.forEach(email => {
      const priority = emailPriorities.get(email.id);
      const score = priority?.score || 50;
      if (score >= 90) counts.urgent++;
      else if (score >= 70) counts.important++;
      else counts.normal++;
    });
    return counts;
  }, [emails, emailPriorities]);

  return {
    // State
    emails: displayEmails, // Show paginated emails instead of all
    allEmails: filteredEmails, // Keep reference to all filtered emails
    selectedIndex,
    view,
    searchQuery,
    composeMode,
    aiSuggestions,
    emailPriorities,
    quickReplies,
    sortByPriority,
    stats,
    connectionStatus,
    selectedEmail,
    priorityCounts,

    // Pagination
    currentPage,
    totalPages,
    emailsPerPage,

    // Actions
    setSelectedIndex,
    setView,
    setSearchQuery,
    setComposeMode,
    setAiSuggestions,
    setSortByPriority,
    setCurrentPage,
    generateQuickReplies,
    prioritizeEmails,

    // Navigation helpers
    nextPage: () => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1)),
    prevPage: () => setCurrentPage(prev => Math.max(0, prev - 1)),
    goToPage: (page: number) => setCurrentPage(Math.max(0, Math.min(totalPages - 1, page))),

    // Database operations
    refreshEmails: () => {
      const allEmails = db.getEmailsWithPriority(100);
      setEmails(allEmails);
      setStats(db.getStats());
    }
  };
}