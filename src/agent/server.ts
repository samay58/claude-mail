#!/usr/bin/env node
/**
 * Node.js HTTP Agent for Claude Mail
 * Exposes existing TypeScript managers (Database, AI, SMTP, IMAP) over HTTP
 * for consumption by the Go Bubble Tea TUI
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import DatabaseManager, { EmailRecord } from '../database.js';
import AIManager from '../core/AIManager.js';
import SMTPManager from '../core/SMTPManager.js';
import ImapManager from '../imap.js';

const app = express();
const port = parseInt(process.env.AGENT_PORT || '5178');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize singletons
const db = DatabaseManager.getInstance();
const ai = AIManager.getInstance();
const smtp = SMTPManager.getInstance();

// Error handler wrapper
const asyncHandler = (fn: any) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// HEALTH & STATUS ROUTES
// ============================================================================

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    ai_configured: ai.isConfigured(),
    smtp_configured: !!process.env.SMTP_HOST || !!process.env.IMAP_HOST,
  });
});

app.get('/stats', (_req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

// ============================================================================
// EMAIL QUERY ROUTES
// ============================================================================

app.get('/emails', asyncHandler(async (req: any, res: any) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;
  const q = req.query.q as string || '';
  const view = req.query.view as string || '';

  let emails: any[];

  if (q) {
    // Search mode
    emails = db.searchEmails(q, limit);
  } else {
    // Normal listing with priorities
    emails = db.getEmailsWithPriority(limit, offset);
  }

  // Apply view filters
  if (view) {
    emails = filterByView(emails, view);
  }

  // Transform to API-friendly format
  const rows = emails.map(e => ({
    id: e.id,
    threadId: e.thread_id,
    from: e.sender_name || e.sender_email,
    fromEmail: e.sender_email,
    subject: e.subject,
    snippet: e.snippet,
    date: e.date,
    dateShort: formatDateShort(e.date),
    isRead: Boolean(e.is_read),
    isStarred: Boolean(e.is_starred),
    priority: e.priority_score || 50,
    priorityCategory: e.priority_category || 'normal',
  }));

  res.json(rows);
}));

app.get('/emails/:id', asyncHandler(async (req: any, res: any) => {
  const emailId = req.params.id;
  const email = db.getEmailById(emailId);

  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Get AI cache if available
  const aiCache = db.getAICache(emailId);

  // Convert HTML to markdown (basic conversion for now)
  const markdown = email.body_html
    ? htmlToMarkdown(email.body_html)
    : email.body_text || '';

  res.json({
    id: email.id,
    threadId: email.thread_id,
    messageId: email.message_id,
    from: email.sender_name || email.sender_email,
    fromEmail: email.sender_email,
    to: email.recipient_emails,
    subject: email.subject,
    date: email.date,
    bodyText: email.body_text,
    bodyHtml: email.body_html,
    markdown: markdown,
    snippet: email.snippet,
    isRead: Boolean(email.is_read),
    isStarred: Boolean(email.is_starred),
    folder: email.folder,
    labels: JSON.parse(email.labels || '[]'),
    priority: aiCache?.priority_score || 50,
    priorityCategory: aiCache?.priority_category || 'normal',
    priorityReason: aiCache?.priority_reason,
  });
}));

// ============================================================================
// EMAIL ACTION ROUTES
// ============================================================================

app.post('/compose', asyncHandler(async (req: any, res: any) => {
  const { to, cc, bcc, subject, body } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  const messageId = await smtp.sendEmail({ to, cc, bcc, subject, text: body });

  res.json({
    success: true,
    messageId,
    timestamp: new Date().toISOString()
  });
}));

app.post('/reply', asyncHandler(async (req: any, res: any) => {
  const { emailId, body, replyAll } = req.body;

  if (!emailId || !body) {
    return res.status(400).json({ error: 'Missing required fields: emailId, body' });
  }

  const originalEmail = db.getEmailById(emailId);
  if (!originalEmail) {
    return res.status(404).json({ error: 'Original email not found' });
  }

  const result = await smtp.sendReply(
    originalEmail.message_id,
    originalEmail.sender_email,
    originalEmail.subject,
    body,
    [originalEmail.message_id] // references array
  );

  const messageId = result.messageId;

  res.json({
    success: true,
    messageId,
    timestamp: new Date().toISOString()
  });
}));

app.post('/sync', asyncHandler(async (req: any, res: any) => {
  const days = parseInt(req.body.days as string) || 7;
  const limit = parseInt(req.body.limit as string) || 150;

  // Trigger async sync - don't wait for completion
  const imap = ImapManager.getInstance();
  imap.getRecentEmails(days, limit).then(async emails => {
    // Insert emails into database
    const insertedIds: string[] = [];
    emails.forEach(email => {
      const emailRecord = {
        id: email.id,
        thread_id: email.threadId,
        message_id: email.messageId,
        subject: email.subject,
        sender_email: email.from.email,
        sender_name: email.from.name,
        recipient_emails: JSON.stringify(email.to),
        date: email.date.toISOString(),
        body_text: email.bodyText,
        body_html: email.bodyHtml,
        snippet: email.snippet,
        is_read: email.isRead,
        is_starred: false,
        is_important: false,
        folder: 'INBOX',
        labels: '[]',
      };
      db.insertEmail(emailRecord);
      insertedIds.push(email.id);
    });
    console.log(`✅ Synced ${emails.length} emails`);

    // Auto-prioritize newly synced emails
    console.log(`[Sync] Auto-prioritizing ${insertedIds.length} new emails...`);
    const emailsToProcess = emails.map(e => db.getEmailById(e.id)).filter(Boolean) as any[];

    let prioritized = 0;
    for (const email of emailsToProcess) {
      try {
        await ai.prioritizeEmail(email);
        prioritized++;
      } catch (err) {
        console.error(`[Sync] Prioritization error for ${email.id}:`, err);
      }
    }
    console.log(`[Sync] ✅ Prioritized ${prioritized}/${emailsToProcess.length} emails`);
  }).catch(err => {
    console.error('IMAP sync error:', err);
  });

  res.json({
    success: true,
    message: 'Sync started in background',
    timestamp: new Date().toISOString()
  });
}));

app.post('/star', asyncHandler(async (req: any, res: any) => {
  const { emailId, starred } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  db.markAsStarred(emailId, starred);

  res.json({ success: true });
}));

app.post('/read', asyncHandler(async (req: any, res: any) => {
  const { emailId, read } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  // markAsRead only sets to true; we'll need to handle false separately if needed
  if (read) {
    db.markAsRead(emailId);
  }
  // TODO: Add markAsUnread method to database if we need to set to false

  res.json({ success: true });
}));

// ============================================================================
// BULK OPERATION ROUTES
// ============================================================================

app.post('/emails/mark-read', asyncHandler(async (req: any, res: any) => {
  const { emailIds, read } = req.body;

  if (!emailIds || !Array.isArray(emailIds)) {
    return res.status(400).json({ error: 'Missing or invalid emailIds array' });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const emailId of emailIds) {
    try {
      if (read) {
        db.markAsRead(emailId);
      } else {
        db.markAsUnread(emailId);
      }
      successCount++;
    } catch (error) {
      failureCount++;
    }
  }

  res.json({
    success: true,
    successCount,
    failureCount,
    total: emailIds.length
  });
}));

app.post('/emails/star', asyncHandler(async (req: any, res: any) => {
  const { emailIds, starred } = req.body;

  if (!emailIds || !Array.isArray(emailIds)) {
    return res.status(400).json({ error: 'Missing or invalid emailIds array' });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const emailId of emailIds) {
    try {
      db.markAsStarred(emailId, starred);
      successCount++;
    } catch (error) {
      failureCount++;
    }
  }

  res.json({
    success: true,
    successCount,
    failureCount,
    total: emailIds.length
  });
}));

app.post('/emails/delete', asyncHandler(async (req: any, res: any) => {
  const { emailIds } = req.body;

  if (!emailIds || !Array.isArray(emailIds)) {
    return res.status(400).json({ error: 'Missing or invalid emailIds array' });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const emailId of emailIds) {
    try {
      db.deleteEmail(emailId);
      successCount++;
    } catch (error) {
      failureCount++;
    }
  }

  res.json({
    success: true,
    successCount,
    failureCount,
    total: emailIds.length
  });
}));

app.post('/emails/archive', asyncHandler(async (req: any, res: any) => {
  const { emailIds } = req.body;

  if (!emailIds || !Array.isArray(emailIds)) {
    return res.status(400).json({ error: 'Missing or invalid emailIds array' });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const emailId of emailIds) {
    try {
      db.archiveEmail(emailId);
      successCount++;
    } catch (error) {
      failureCount++;
    }
  }

  res.json({
    success: true,
    successCount,
    failureCount,
    total: emailIds.length
  });
}));

// ============================================================================
// AI ROUTES
// ============================================================================

app.post('/ai/quick-replies', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  const replies = await ai.suggestQuickReplies(email);

  res.json({ replies });
}));

app.post('/ai/summarize', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  const summary = await ai.summarizeEmail(email);

  res.json(summary);
}));

app.post('/ai/draft-suggest', asyncHandler(async (req: any, res: any) => {
  const { emailId, context } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  const suggestions = await ai.generateDraftSuggestions(email, context);

  res.json({ suggestions });
}));

app.post('/ai/priority-explain', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  const priority = await ai.prioritizeEmail(email);

  res.json({
    score: priority.score,
    category: priority.category,
    reason: priority.reason,
    suggestedAction: priority.suggestedAction
  });
}));

app.post('/ai/prioritize-all', asyncHandler(async (req: any, res: any) => {
  const limit = parseInt(req.body.limit as string) || 50;

  // Get emails without priority scores (or all recent emails)
  const emails = db.getEmailsWithPriority(limit);
  const emailsToPrioritize = emails.filter(e => !e.priority_score || e.priority_score === 50);

  console.log(`[Prioritize] Starting bulk prioritization for ${emailsToPrioritize.length} emails`);

  // Respond immediately - prioritization happens in background
  res.json({
    success: true,
    message: `Prioritizing ${emailsToPrioritize.length} emails in background`,
    count: emailsToPrioritize.length,
    timestamp: new Date().toISOString()
  });

  // Process prioritization asynchronously
  (async () => {
    let processed = 0;
    for (const email of emailsToPrioritize) {
      try {
        await ai.prioritizeEmail(email);
        processed++;
        if (processed % 10 === 0) {
          console.log(`[Prioritize] Progress: ${processed}/${emailsToPrioritize.length}`);
        }
      } catch (err) {
        console.error(`[Prioritize] Error processing email ${email.id}:`, err);
      }
    }
    console.log(`[Prioritize] ✅ Completed: ${processed}/${emailsToPrioritize.length} emails prioritized`);
  })();
}));

// ============================================================================
// SMART BUNDLE ROUTES
// ============================================================================

app.get('/bundles', asyncHandler(async (_req: any, res: any) => {
  const emails = db.getEmailsWithPriority(1000); // Get more emails for accurate counts

  const counts = {
    urgent: 0,
    important: 0,
    needs_reply: 0,
    calendar: 0,
    newsletter: 0,
  };

  for (const email of emails) {
    const priority = email.priority_score || 50;

    // Urgent: priority >= 90
    if (priority >= 90) {
      counts.urgent++;
    }

    // Important: priority >= 70 && < 90
    if (priority >= 70 && priority < 90) {
      counts.important++;
    }

    // Needs Reply: Questions from important senders, unread
    const hasQuestion = email.body_text && email.body_text.includes('?');
    if (hasQuestion && !email.is_read && priority >= 60) {
      counts.needs_reply++;
    }

    // Calendar: Meeting-related keywords
    const calendarKeywords = /meeting|calendar|invite|rsvp|zoom|teams/i;
    if (calendarKeywords.test(email.subject)) {
      counts.calendar++;
    }

    // Newsletter: Bulk/promotional patterns
    const newsletterPatterns = /newsletter|unsubscribe|promotional|deal|offer/i;
    const fromNewsletter = email.sender_email && (
      email.sender_email.includes('newsletter') ||
      email.sender_email.includes('noreply') ||
      email.sender_email.includes('no-reply')
    );
    if (newsletterPatterns.test(email.body_text || '') || fromNewsletter) {
      counts.newsletter++;
    }
  }

  res.json(counts);
}));

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function filterByView(emails: any[], view: string): any[] {
  switch (view) {
    case 'inbox':
      return emails; // Default view

    case 'starred':
      return emails.filter(e => e.is_starred);

    case 'sent':
      return emails.filter(e => e.folder === 'SENT');

    case 'drafts':
      return emails.filter(e => e.folder === 'DRAFTS');

    case 'all':
      return emails;

    case 'urgent':
      return emails.filter(e => (e.priority_score || 50) >= 90);

    case 'important':
      return emails.filter(e => {
        const p = e.priority_score || 50;
        return p >= 70 && p < 90;
      });

    case 'needs_reply':
      return emails.filter(e => {
        const hasQuestion = e.body_text && e.body_text.includes('?');
        const priority = e.priority_score || 50;
        return hasQuestion && !e.is_read && priority >= 60;
      });

    case 'calendar':
      return emails.filter(e => {
        const keywords = /meeting|calendar|invite|rsvp|zoom|teams/i;
        return keywords.test(e.subject);
      });

    case 'newsletter':
      return emails.filter(e => {
        const patterns = /newsletter|unsubscribe|promotional|deal|offer/i;
        const fromNewsletter = e.sender_email && (
          e.sender_email.includes('newsletter') ||
          e.sender_email.includes('noreply') ||
          e.sender_email.includes('no-reply')
        );
        return patterns.test(e.body_text || '') || fromNewsletter;
      });

    default:
      return emails;
  }
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function htmlToMarkdown(html: string): string {
  // Very basic HTML to markdown conversion
  // TODO: Use a proper library like turndown when needed
  let md = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<[^>]+>/g, ''); // Remove remaining HTML tags

  return md.trim();
}

// ============================================================================
// ERROR HANDLER
// ============================================================================

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(port, () => {
  console.log(`\n✅ Claude Mail Agent listening on http://localhost:${port}`);
  console.log(`   Health: http://localhost:${port}/health`);
  console.log(`   AI configured: ${ai.isConfigured()}`);
  console.log(`\n   Press Ctrl+C to stop\n`);
});
