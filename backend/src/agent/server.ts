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
import { FeatureExtractor } from '../core/features/FeatureExtractor.js';
import { PriorityScorer } from '../core/features/PriorityScorer.js';
import { getSearchCache } from '../core/SearchCache.js';
import { buildCleanBody } from '../core/CleanBody.js';

const app = express();
const port = parseInt(process.env.AGENT_PORT || '5178');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize singletons
const db = DatabaseManager.getInstance();
const ai = AIManager.getInstance();
const smtp = SMTPManager.getInstance();
const featureExtractor = FeatureExtractor.getInstance();
const priorityScorer = PriorityScorer.getInstance();
const searchCache = getSearchCache();

/**
 * Helper: Parse RFC headers from database record into EmailHeaders format
 * Converts from camelCase (stored) to kebab-case (expected by RFCGates)
 */
function parseRfcHeaders(email: any): Record<string, string | undefined> {
  if (!email.rfc_headers) return {};

  try {
    const stored = typeof email.rfc_headers === 'string'
      ? JSON.parse(email.rfc_headers)
      : email.rfc_headers;

    return {
      'list-unsubscribe': stored.listUnsubscribe,
      'list-id': stored.listId,
      'auto-submitted': stored.autoSubmitted,
      'content-type': stored.contentType
    };
  } catch (e) {
    return {};
  }
}

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

  // Build cache key from query params
  const cacheKey = q ? `search:${q}:${view}:${limit}:${offset}` : '';

  // Check cache for search queries (not for normal listing which changes frequently)
  if (q && cacheKey) {
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
  }

  let emails: any[];

  if (q) {
    // Search mode - optimized with priority data
    emails = db.searchEmailsWithPriority(q, limit);
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

  // Cache search results
  if (q && cacheKey) {
    searchCache.set(cacheKey, rows);
  }

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

  const cleanBody = buildCleanBody(email);

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
    bodyClean: cleanBody.text,
    bodyQuoted: cleanBody.quoted,
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
  const limit = parseInt(req.body.limit as string) || 2000;

  try {
    // Fetch emails from BOTH INBOX and SENT folders
    const imap = ImapManager.getInstance();
    const { inbox, sent } = await imap.syncAllFolders(days, limit, 50);
    const allEmails = [...inbox, ...sent];

    // Insert emails into database and track new vs existing
    const insertedIds: string[] = [];
    let newEmailCount = 0;
    let inboxCount = 0;
    let sentCount = 0;

    allEmails.forEach(email => {
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
        folder: email.folder || 'INBOX',
        folder_type: email.folderType || 'inbox',
        labels: '[]',
        rfc_headers: JSON.stringify(email.rfcHeaders || {}),
      };

      const isNew = db.insertEmail(emailRecord);
      if (isNew) {
        newEmailCount++;
        if (email.folderType === 'sent') sentCount++;
        else inboxCount++;
      }
      insertedIds.push(email.id);
    });

    console.log(`✅ Synced ${allEmails.length} emails (${newEmailCount} new: ${inboxCount} inbox, ${sentCount} sent)`);

    // Auto-prioritize newly synced emails using NEW PriorityScorer system
    console.log(`[Sync] Auto-prioritizing ${insertedIds.length} emails (RFC-based scoring)...`);
    const emailsToProcess = allEmails.map(e => db.getEmailById(e.id)).filter(Boolean) as any[];

    let prioritized = 0;
    for (const email of emailsToProcess) {
      try {
        // Extract features using FeatureExtractor (includes all RFC gates)
        const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

        // Calculate priority using PriorityScorer (weighted linear model)
        const priorityScore = priorityScorer.calculatePriority(features);

        // Store priority score in ai_cache table
        db.setAICache(email.id, {
          priority_score: priorityScore.score,
          priority_category: priorityScore.category,
          quick_replies: '[]',
          draft_suggestions: '[]'
        });

        // Log progress every 100 emails to reduce console spam
        if (prioritized % 100 === 0 || prioritized === emailsToProcess.length - 1) {
          console.log(`[Sync] Scored ${prioritized + 1}/${emailsToProcess.length} emails`);
        }

        prioritized++;
      } catch (err) {
        console.error(`[Sync] Prioritization error for ${email.id}:`, err);
      }
    }
    console.log(`[Sync] ✅ Prioritized ${prioritized}/${emailsToProcess.length} emails using NEW scoring system`);

    // Return completion status
    res.json({
      success: true,
      message: newEmailCount > 0 ? 'Sync complete' : 'No new emails',
      hasNewEmails: newEmailCount > 0,
      newEmailCount: newEmailCount,
      inboxCount: inboxCount,
      sentCount: sentCount,
      totalFetched: allEmails.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('IMAP sync error:', err);
    res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
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

app.post('/emails/clear-all', asyncHandler(async (_req: any, res: any) => {
  console.log('⚠️  Clearing ALL emails from database...');
  const result = db.clearAllEmails();
  console.log(`✅ Cleared ${result.deleted} emails`);
  res.json({ success: true, deleted: result.deleted });
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

  // Process prioritization asynchronously using NEW PriorityScorer system
  (async () => {
    let processed = 0;
    for (const email of emailsToPrioritize) {
      try {
        // Extract features using FeatureExtractor (includes all RFC gates)
        const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

        // Calculate priority using PriorityScorer (weighted linear model)
        const priorityScore = priorityScorer.calculatePriority(features);

        // Store priority score in ai_cache table
        db.setAICache(email.id, {
          priority_score: priorityScore.score,
          priority_category: priorityScore.category,
          quick_replies: '[]',
          draft_suggestions: '[]'
        });

        processed++;
        if (processed % 10 === 0) {
          console.log(`[Prioritize] Progress: ${processed}/${emailsToPrioritize.length} (NEW scoring system)`);
        }
      } catch (err) {
        console.error(`[Prioritize] Error processing email ${email.id}:`, err);
      }
    }
    console.log(`[Prioritize] ✅ Completed: ${processed}/${emailsToPrioritize.length} emails prioritized with NEW scoring`);
  })();
}));

// ============================================================================
// PRIORITY SCORING ROUTES (Week 3 - New RFC-based scoring system)
// ============================================================================

/**
 * POST /emails/score
 * Score a single email using the new PriorityScorer system
 *
 * Request: { emailId: string }
 * Response: { emailId, score, category, confidence, reasoning, features, featureWeights }
 */
app.post('/emails/score', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.body;

  if (!emailId) {
    return res.status(400).json({ error: 'Missing emailId' });
  }

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Extract features using FeatureExtractor
  const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

  // Calculate priority score
  const priorityScore = priorityScorer.calculatePriority(features);

  // Get feature importance for explainability
  const featureImportance = priorityScorer.getFeatureImportance(priorityScore);

  res.json({
    emailId: priorityScore.email_id,
    score: priorityScore.score,
    category: priorityScore.category,
    confidence: priorityScore.confidence,
    reasoning: priorityScore.reasoning,
    features: features,
    featureWeights: priorityScore.feature_weights,
    featureImportance: featureImportance,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /emails/score/batch
 * Score multiple emails in parallel using the new PriorityScorer system
 *
 * Request: { emailIds: string[], parallelism?: number }
 * Response: { scores: Array<...>, stats: { total, successful, failed, duration } }
 */
app.post('/emails/score/batch', asyncHandler(async (req: any, res: any) => {
  const { emailIds, parallelism = 10 } = req.body;

  if (!emailIds || !Array.isArray(emailIds)) {
    return res.status(400).json({ error: 'Missing or invalid emailIds array' });
  }

  const startTime = Date.now();
  const results: any[] = [];
  const errors: Array<{ emailId: string; error: string }> = [];

  // Process in batches for parallel execution
  const batchSize = Math.min(parallelism, 50); // Max 50 concurrent
  for (let i = 0; i < emailIds.length; i += batchSize) {
    const batch = emailIds.slice(i, i + batchSize);

    const batchPromises = batch.map(async (emailId) => {
      try {
        const email = db.getEmailById(emailId);
        if (!email) {
          throw new Error(`Email ${emailId} not found`);
        }

        // Extract features
        const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

        // Calculate priority
        const priorityScore = priorityScorer.calculatePriority(features);

        return {
          emailId: priorityScore.email_id,
          score: priorityScore.score,
          category: priorityScore.category,
          confidence: priorityScore.confidence,
          reasoning: priorityScore.reasoning,
          featureWeights: priorityScore.feature_weights
        };
      } catch (err: any) {
        errors.push({ emailId, error: err.message });
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(r => r !== null));
  }

  const duration = Date.now() - startTime;

  res.json({
    scores: results,
    stats: {
      total: emailIds.length,
      successful: results.length,
      failed: errors.length,
      duration: `${duration}ms`,
      parallelism: batchSize
    },
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /emails/rescore
 * Rescore all emails that don't have priority scores (or have default score of 50)
 *
 * Request: { limit?: number }
 * Response: { scored: number, duration: string, errors: string[] }
 */
app.post('/emails/rescore', asyncHandler(async (req: any, res: any) => {
  const limit = parseInt(req.body.limit as string) || 100;

  const startTime = Date.now();

  // Get emails without priority scores or with default score
  const allEmails = db.getEmailsWithPriority(limit);
  const emailsToScore = allEmails.filter(e => !e.priority_score || e.priority_score === 50);

  console.log(`[Rescore] Starting rescore for ${emailsToScore.length} emails`);

  const errors: string[] = [];
  let scored = 0;

  // Process emails sequentially to avoid overwhelming the system
  for (const email of emailsToScore) {
    try {
      // Extract features
      const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

      // Calculate priority
      const priorityScore = priorityScorer.calculatePriority(features);

      // Store priority score in ai_cache table
      db.setAICache(email.id, {
        priority_score: priorityScore.score,
        priority_category: priorityScore.category,
        quick_replies: '[]',
        draft_suggestions: '[]'
      });

      scored++;

      if (scored % 10 === 0) {
        console.log(`[Rescore] Progress: ${scored}/${emailsToScore.length}`);
      }
    } catch (err: any) {
      console.error(`[Rescore] Error scoring email ${email.id}:`, err.message);
      errors.push(`${email.id}: ${err.message}`);
    }
  }

  const duration = Date.now() - startTime;

  console.log(`[Rescore] ✅ Completed: ${scored}/${emailsToScore.length} emails scored in ${duration}ms`);

  res.json({
    success: true,
    scored,
    total: emailsToScore.length,
    duration: `${duration}ms`,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /rescore-all
 * Rescore ALL emails in the database (forces rescore even if already scored)
 * Use this after making changes to scoring algorithm or syncing SENT folder
 *
 * Request: { limit?: number }
 * Response: { scored: number, total: number, duration: string, errors: string[] }
 */
app.post('/rescore-all', asyncHandler(async (req: any, res: any) => {
  const limit = parseInt(req.body.limit as string) || 1000;

  const startTime = Date.now();

  // Get ALL emails (not just unscored ones)
  const allEmails = db.getEmails(limit);

  console.log(`[Rescore-All] Starting FULL rescore for ${allEmails.length} emails`);

  const errors: string[] = [];
  let scored = 0;

  // Process emails sequentially to avoid overwhelming the system
  for (const email of allEmails) {
    try {
      // Extract features (this will update relationship scores)
      const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

      // Calculate priority
      const priorityScore = priorityScorer.calculatePriority(features);

      // Store priority score in ai_cache table
      db.setAICache(email.id, {
        priority_score: priorityScore.score,
        priority_category: priorityScore.category,
        quick_replies: '[]',
        draft_suggestions: '[]'
      });

      scored++;

      if (scored % 50 === 0) {
        console.log(`[Rescore-All] Progress: ${scored}/${allEmails.length}`);
      }
    } catch (err: any) {
      console.error(`[Rescore-All] Error scoring email ${email.id}:`, err.message);
      errors.push(`${email.id}: ${err.message}`);
    }
  }

  const duration = Date.now() - startTime;

  console.log(`[Rescore-All] ✅ Completed: ${scored}/${allEmails.length} emails rescored in ${duration}ms`);

  res.json({
    success: true,
    scored,
    total: allEmails.length,
    duration: `${duration}ms`,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString()
  });
}));

// ============================================================================
// SHADOW MODE & DEBUG ROUTES
// ============================================================================

// In-memory shadow mode state (could persist to DB if needed)
let shadowModeEnabled = process.env.SHADOW_MODE === 'true' || false;

/**
 * GET /shadow/status
 * Check shadow mode status and show system info
 */
app.get('/shadow/status', (_req, res) => {
  res.json({
    enabled: shadowModeEnabled,
    version: '2.0.0',
    scoringSystem: 'RFC-based weighted linear model',
    features: 22,
    categories: ['urgent', 'important', 'normal', 'low', 'spam'],
    weights: {
      NEWSLETTER_PENALTY: -30,
      AUTO_GENERATED_PENALTY: -20,
      RELATIONSHIP_MAX: 30,
      VIP_SENDER: 15,
      EXPLICIT_ASK: 20,
      DEADLINE_BONUS: 15,
      URGENT_DEADLINE_BONUS: 25,
      THREAD_YOU_OWE: 20,
      REPLY_NEED_MAX: 25,
      INTENT_CONFIRM: 10,
      INTENT_REQUEST: 5,
      INTENT_INFORM: -5
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /shadow/enable
 * Enable shadow mode for debug visibility
 */
app.post('/shadow/enable', (_req, res) => {
  shadowModeEnabled = true;
  console.log('[Shadow] Shadow mode ENABLED');
  res.json({ success: true, enabled: true, message: 'Shadow mode enabled' });
});

/**
 * POST /shadow/disable
 * Disable shadow mode
 */
app.post('/shadow/disable', (_req, res) => {
  shadowModeEnabled = false;
  console.log('[Shadow] Shadow mode DISABLED');
  res.json({ success: true, enabled: false, message: 'Shadow mode disabled' });
});

/**
 * GET /shadow/features/:emailId
 * Get all 22 extracted features for debugging
 */
app.get('/shadow/features/:emailId', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.params;

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Extract all features
  const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

  // Group features by category for readability
  const groupedFeatures = {
    rfcGates: {
      is_newsletter: features.is_newsletter,
      is_auto_generated: features.is_auto_generated,
      has_list_unsubscribe: features.has_list_unsubscribe,
      has_list_id: features.has_list_id,
      has_auto_submitted: features.has_auto_submitted,
      has_calendar: features.has_calendar,
      calendar_start_epoch: features.calendar_start_epoch,
      otp_detected: features.otp_detected,
      otp_age_minutes: features.otp_age_minutes
    },
    relationship: {
      relationship_score: features.relationship_score,
      is_vip_sender: features.is_vip_sender,
      reply_count_from_user: features.reply_count_from_user,
      reply_count_to_user: features.reply_count_to_user,
      last_interaction_epoch: features.last_interaction_epoch
    },
    threadContext: {
      thread_you_owe: features.thread_you_owe,
      thread_recency_minutes: features.thread_recency_minutes,
      thread_length: features.thread_length
    },
    contentIntent: {
      explicit_ask: features.explicit_ask,
      deadline_epoch: features.deadline_epoch,
      time_to_deadline_min: features.time_to_deadline_min,
      content_intent: features.content_intent
    },
    replyPrediction: {
      reply_need_prob: features.reply_need_prob,
      reply_latency_bucket: features.reply_latency_bucket
    }
  };

  res.json({
    emailId: features.email_id,
    features: features,
    grouped: groupedFeatures,
    shadowMode: shadowModeEnabled,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /shadow/explain/:emailId
 * Full explainability: features + score + reasoning
 */
app.get('/shadow/explain/:emailId', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.params;

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Extract features
  const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));

  // Calculate priority
  const priorityScore = priorityScorer.calculatePriority(features);

  // Get feature importance
  const featureImportance = priorityScorer.getFeatureImportance(priorityScore);

  // Get human-readable explanation
  const explanation = priorityScorer.explainScore(priorityScore);

  res.json({
    emailId: priorityScore.email_id,
    subject: email.subject,
    from: email.sender_email,

    // Score results
    score: priorityScore.score,
    category: priorityScore.category,
    confidence: priorityScore.confidence,

    // Explainability
    reasoning: priorityScore.reasoning,
    featureWeights: priorityScore.feature_weights,
    featureImportance: featureImportance,
    explanation: explanation,

    // Raw features (for debugging)
    rawFeatures: shadowModeEnabled ? features : undefined,

    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /feedback
 * Record user feedback for learning system
 *
 * Request: { emailId: string, action: 'star'|'unstar'|'archive'|'mark_urgent'|'mark_bulk' }
 */
app.post('/feedback', asyncHandler(async (req: any, res: any) => {
  const { emailId, action } = req.body;

  if (!emailId || !action) {
    return res.status(400).json({ error: 'Missing emailId or action' });
  }

  const validActions = ['star', 'unstar', 'archive', 'mark_urgent', 'mark_bulk', 'move_to_bundle', 'reply', 'ignore'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Valid actions: ${validActions.join(', ')}` });
  }

  // Get current prediction for this email
  const aiCache = db.getAICache(emailId);
  const predictedScore = aiCache?.priority_score || null;
  const predictedCategory = aiCache?.priority_category || null;

  // Store feedback in database
  const rawDb = (db as any).db;
  const stmt = rawDb.prepare(`
    INSERT INTO user_feedback (email_id, action, predicted_score, predicted_bucket, created_at)
    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
  `);
  stmt.run(emailId, action, predictedScore, predictedCategory);

  console.log(`[Feedback] Recorded: ${action} on ${emailId} (predicted: ${predictedScore} ${predictedCategory})`);

  res.json({
    success: true,
    emailId,
    action,
    predictedScore,
    predictedCategory,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /feedback/stats
 * Get feedback statistics for algorithm analysis
 */
app.get('/feedback/stats', asyncHandler(async (_req: any, res: any) => {
  const rawDb = (db as any).db;

  // Get action counts
  const actionCounts = rawDb.prepare(`
    SELECT action, COUNT(*) as count
    FROM user_feedback
    GROUP BY action
    ORDER BY count DESC
  `).all() as { action: string; count: number }[];

  // Get accuracy stats (star on high-priority = correct, star on low = incorrect)
  const accuracyStats = rawDb.prepare(`
    SELECT
      predicted_bucket,
      action,
      COUNT(*) as count
    FROM user_feedback
    WHERE predicted_bucket IS NOT NULL
    GROUP BY predicted_bucket, action
    ORDER BY predicted_bucket, count DESC
  `).all() as { predicted_bucket: string; action: string; count: number }[];

  // Get recent feedback
  const recentFeedback = rawDb.prepare(`
    SELECT f.*, e.subject, e.sender_email
    FROM user_feedback f
    LEFT JOIN emails e ON f.email_id = e.id
    ORDER BY f.created_at DESC
    LIMIT 20
  `).all();

  res.json({
    totalFeedback: actionCounts.reduce((sum, a) => sum + a.count, 0),
    actionCounts,
    accuracyStats,
    recentFeedback,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /shadow/compare/:emailId
 * Compare RFC-based score with AI heuristic score (for validation)
 */
app.get('/shadow/compare/:emailId', asyncHandler(async (req: any, res: any) => {
  const { emailId } = req.params;

  const email = db.getEmailById(emailId);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  // Get RFC-based score (new system)
  const features = await featureExtractor.extractFeatures(email, parseRfcHeaders(email));
  const rfcScore = priorityScorer.calculatePriority(features);

  // Get AI heuristic score (old system) if AI is configured
  let aiScore = null;
  if (ai.isConfigured()) {
    try {
      aiScore = await ai.prioritizeEmail(email);
    } catch (err) {
      console.log('[Shadow] AI scoring not available, using RFC-only');
    }
  }

  res.json({
    emailId,
    subject: email.subject,

    // RFC-based score (deterministic)
    rfcBased: {
      score: rfcScore.score,
      category: rfcScore.category,
      confidence: rfcScore.confidence,
      reasoning: rfcScore.reasoning
    },

    // AI heuristic score (if available)
    aiHeuristic: aiScore ? {
      score: aiScore.score,
      category: aiScore.category,
      reason: aiScore.reason
    } : null,

    // Comparison
    difference: aiScore ? Math.abs(rfcScore.score - aiScore.score) : null,
    agreement: aiScore ? rfcScore.category === aiScore.category : null,

    timestamp: new Date().toISOString()
  });
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
