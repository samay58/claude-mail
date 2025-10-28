import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface EmailRecord {
  id: string;
  thread_id: string;
  message_id: string;
  subject: string;
  sender_email: string;
  sender_name?: string;
  recipient_emails: string;
  date: string;
  body_text?: string;
  body_html?: string;
  snippet: string;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  folder: string;
  labels: string;
  created_at: string;
  updated_at: string;
}

class DatabaseManager {
  private db: Database.Database;
  private static instance: DatabaseManager;

  private constructor() {
    const dbPath = join(process.cwd(), 'data', 'emails.db');

    // Ensure data directory exists
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private initializeSchema() {
    // Enable foreign keys and WAL mode for performance
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA journal_mode = WAL');

    // Emails table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_id TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        sender_name TEXT,
        recipient_emails TEXT NOT NULL,
        date TEXT NOT NULL,
        body_text TEXT,
        body_html TEXT,
        snippet TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        is_starred BOOLEAN DEFAULT FALSE,
        is_important BOOLEAN DEFAULT FALSE,
        folder TEXT DEFAULT 'INBOX',
        labels TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Contacts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        email TEXT PRIMARY KEY,
        name TEXT,
        domain TEXT,
        first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        email_count INTEGER DEFAULT 0
      )
    `);

    // Create indexes for performance
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender_email)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(is_read)');

    // AI cache table for storing AI analysis results
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_cache (
        email_id TEXT PRIMARY KEY,
        priority_score INTEGER DEFAULT 50,
        priority_category TEXT DEFAULT 'normal',
        priority_reason TEXT,
        suggested_action TEXT,
        quick_replies TEXT DEFAULT '[]',
        draft_suggestions TEXT DEFAULT '[]',
        sender_profile TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
        subject, sender_name, sender_email, body_text, snippet,
        content='emails',
        content_rowid='rowid'
      )
    `);

    // FTS triggers
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
        INSERT INTO emails_fts(rowid, subject, sender_name, sender_email, body_text, snippet)
        VALUES (new.rowid, new.subject, new.sender_name, new.sender_email, new.body_text, new.snippet);
      END
    `);

    // Phase 7: Intelligent Prioritization Tables

    // Message features table for scoring algorithm
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_features (
        -- Primary key
        email_id TEXT PRIMARY KEY,

        -- Deterministic gates (RFC-compliant detection)
        is_newsletter INTEGER DEFAULT 0,           -- Has List-Unsubscribe (RFC 2369)
        is_auto_generated INTEGER DEFAULT 0,       -- Has Auto-Submitted (RFC 3834)
        has_list_unsubscribe INTEGER DEFAULT 0,    -- RFC 2369 header present
        has_list_id INTEGER DEFAULT 0,             -- RFC 2919 header present
        has_auto_submitted INTEGER DEFAULT 0,      -- RFC 3834 header present
        has_calendar INTEGER DEFAULT 0,            -- text/calendar MIME (RFC 5545)
        calendar_start_epoch INTEGER DEFAULT NULL, -- Event start time (unix timestamp)
        otp_detected INTEGER DEFAULT 0,            -- Contains OTP pattern
        otp_age_minutes INTEGER DEFAULT NULL,      -- Minutes since email received

        -- Relationship features
        relationship_score REAL DEFAULT 0.0,       -- 0.0-1.0 based on interaction history
        is_vip_sender INTEGER DEFAULT 0,           -- User-designated VIP
        reply_count_from_user INTEGER DEFAULT 0,   -- How many times user replied to sender
        reply_count_to_user INTEGER DEFAULT 0,     -- How many times sender replied to user
        last_interaction_epoch INTEGER DEFAULT NULL, -- Most recent exchange timestamp

        -- Thread context features
        thread_you_owe INTEGER DEFAULT 0,          -- User's turn to reply in thread
        thread_recency_minutes INTEGER DEFAULT NULL, -- Minutes since last message in thread
        thread_length INTEGER DEFAULT 1,           -- Total messages in thread

        -- Content intent features
        explicit_ask INTEGER DEFAULT 0,            -- Contains explicit request/question
        deadline_epoch INTEGER DEFAULT NULL,       -- Detected deadline (unix timestamp)
        time_to_deadline_min INTEGER DEFAULT NULL, -- Minutes until deadline
        content_intent TEXT DEFAULT NULL,          -- Detected intent: 'request'|'inform'|'confirm'|'schedule'

        -- Reply prediction
        reply_need_prob REAL DEFAULT 0.5,          -- Predicted probability user will reply (0.0-1.0)
        reply_latency_bucket INTEGER DEFAULT 3,    -- Predicted response time: 1=urgent, 2=today, 3=this_week, 4=someday

        -- Metadata
        extracted_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),

        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for message_features performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_features_relationship ON message_features(relationship_score DESC);
      CREATE INDEX IF NOT EXISTS idx_features_deadline ON message_features(deadline_epoch) WHERE deadline_epoch IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_features_you_owe ON message_features(thread_you_owe) WHERE thread_you_owe = 1;
      CREATE INDEX IF NOT EXISTS idx_features_vip ON message_features(is_vip_sender) WHERE is_vip_sender = 1;
    `);

    // Sender relationships table for interaction history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sender_relationships (
        -- Primary key
        sender_email TEXT PRIMARY KEY,

        -- Interaction counts
        emails_received INTEGER DEFAULT 0,
        emails_sent_to INTEGER DEFAULT 0,
        user_replies_count INTEGER DEFAULT 0,      -- User → Sender
        sender_replies_count INTEGER DEFAULT 0,    -- Sender → User
        two_way_exchanges INTEGER DEFAULT 0,       -- Conversations with both directions

        -- Temporal features
        first_contact_epoch INTEGER DEFAULT NULL,
        last_contact_epoch INTEGER DEFAULT NULL,
        avg_reply_latency_minutes REAL DEFAULT NULL, -- User's average response time to this sender

        -- Computed scores
        relationship_score REAL DEFAULT 0.0,       -- 0.0-1.0 composite score
        is_vip INTEGER DEFAULT 0,                  -- User-designated VIP flag

        -- Metadata
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Index for relationship lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_relationships_score ON sender_relationships(relationship_score DESC);
    `);

    // User feedback table for learning system
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        -- Auto-increment primary key
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Email reference
        email_id TEXT NOT NULL,

        -- User action type
        action TEXT NOT NULL,  -- 'star'|'unstar'|'archive'|'mark_urgent'|'mark_bulk'|'move_to_bundle'

        -- Context at time of action
        predicted_score REAL DEFAULT NULL,         -- What our model predicted
        predicted_bucket TEXT DEFAULT NULL,        -- 'urgent'|'important'|'needs_reply'|'bulk'

        -- Timestamp
        created_at INTEGER DEFAULT (strftime('%s', 'now')),

        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      )
    `);

    // Indexes for feedback analysis
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feedback_email ON user_feedback(email_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_action ON user_feedback(action);
      CREATE INDEX IF NOT EXISTS idx_feedback_time ON user_feedback(created_at DESC);
    `);
  }

  // Email operations
  insertEmail(email: Omit<EmailRecord, 'created_at' | 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO emails (
        id, thread_id, message_id, subject, sender_email, sender_name,
        recipient_emails, date, body_text, body_html, snippet,
        is_read, is_starred, is_important, folder, labels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      email.id, email.thread_id, email.message_id, email.subject,
      email.sender_email, email.sender_name, email.recipient_emails,
      email.date, email.body_text, email.body_html, email.snippet,
      email.is_read ? 1 : 0, email.is_starred ? 1 : 0, email.is_important ? 1 : 0,
      email.folder, email.labels
    );

    // Update contact
    this.upsertContact(email.sender_email, email.sender_name);
  }

  getEmails(limit = 50, offset = 0): EmailRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM emails
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as EmailRecord[];
  }

  getEmailById(id: string): EmailRecord | null {
    const stmt = this.db.prepare('SELECT * FROM emails WHERE id = ?');
    return stmt.get(id) as EmailRecord || null;
  }

  searchEmails(query: string, limit = 50): EmailRecord[] {
    // Handle empty query
    if (!query || !query.trim()) {
      return this.getEmails(limit);
    }

    // Escape special FTS5 characters and clean query
    const cleanQuery = query
      .replace(/[\/\\"']/g, ' ')     // Remove special chars
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim();

    if (!cleanQuery) {
      return this.getEmails(limit);
    }

    try {
      // Try FTS5 search first
      const stmt = this.db.prepare(`
        SELECT e.* FROM emails e
        JOIN emails_fts fts ON e.rowid = fts.rowid
        WHERE emails_fts MATCH ?
        ORDER BY e.date DESC
        LIMIT ?
      `);
      return stmt.all(cleanQuery, limit) as EmailRecord[];
    } catch (error) {
      console.error('FTS5 search failed, falling back to LIKE:', error);

      // Fallback to LIKE search
      const stmt = this.db.prepare(`
        SELECT * FROM emails
        WHERE subject LIKE ? OR sender_name LIKE ? OR sender_email LIKE ? OR body_text LIKE ?
        ORDER BY date DESC
        LIMIT ?
      `);
      const searchTerm = `%${cleanQuery}%`;
      return stmt.all(searchTerm, searchTerm, searchTerm, searchTerm, limit) as EmailRecord[];
    }
  }

  markAsRead(id: string): void {
    const stmt = this.db.prepare('UPDATE emails SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  }

  markAsStarred(id: string, starred: boolean): void {
    const stmt = this.db.prepare('UPDATE emails SET is_starred = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(starred ? 1 : 0, id);
  }

  markAsUnread(id: string): void {
    const stmt = this.db.prepare('UPDATE emails SET is_read = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  }

  deleteEmail(id: string): void {
    // For now, we'll mark as deleted by moving to trash folder
    // In a real implementation, you might want to actually delete or move to a trash table
    const stmt = this.db.prepare('UPDATE emails SET folder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run('TRASH', id);
  }

  archiveEmail(id: string): void {
    // Move email to archive folder
    const stmt = this.db.prepare('UPDATE emails SET folder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run('ARCHIVE', id);
  }

  // Contact operations
  private upsertContact(email: string, name?: string): void {
    // Note: domain is a GENERATED column and will be auto-calculated from email
    const stmt = this.db.prepare(`
      INSERT INTO contacts (email, name, email_count, last_seen)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        email_count = email_count + 1,
        last_seen = CURRENT_TIMESTAMP
    `);
    stmt.run(email, name);
  }

  // AI Cache operations
  saveAICache(emailId: string, data: {
    priority_score?: number;
    priority_category?: string;
    priority_reason?: string;
    suggested_action?: string;
    quick_replies?: string[];
    draft_suggestions?: any[];
    sender_profile?: any;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO ai_cache (
        email_id, priority_score, priority_category, priority_reason,
        suggested_action, quick_replies, draft_suggestions, sender_profile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email_id) DO UPDATE SET
        priority_score = COALESCE(excluded.priority_score, priority_score),
        priority_category = COALESCE(excluded.priority_category, priority_category),
        priority_reason = COALESCE(excluded.priority_reason, priority_reason),
        suggested_action = COALESCE(excluded.suggested_action, suggested_action),
        quick_replies = COALESCE(excluded.quick_replies, quick_replies),
        draft_suggestions = COALESCE(excluded.draft_suggestions, draft_suggestions),
        sender_profile = COALESCE(excluded.sender_profile, sender_profile),
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      emailId,
      data.priority_score || 50,
      data.priority_category || 'normal',
      data.priority_reason || null,
      data.suggested_action || null,
      JSON.stringify(data.quick_replies || []),
      JSON.stringify(data.draft_suggestions || []),
      JSON.stringify(data.sender_profile || null)
    );
  }

  getAICache(emailId: string): any {
    const stmt = this.db.prepare('SELECT * FROM ai_cache WHERE email_id = ?');
    const cache = stmt.get(emailId) as any;
    if (!cache) return null;

    return {
      ...cache,
      quick_replies: JSON.parse(cache.quick_replies || '[]'),
      draft_suggestions: JSON.parse(cache.draft_suggestions || '[]'),
      sender_profile: JSON.parse(cache.sender_profile || 'null')
    };
  }

  getEmailsWithPriority(limit = 50, offset = 0): any[] {
    const stmt = this.db.prepare(`
      SELECT e.*,
             COALESCE(a.priority_score, 50) as priority_score,
             COALESCE(a.priority_category, 'normal') as priority_category,
             a.priority_reason,
             a.suggested_action,
             a.quick_replies
      FROM emails e
      LEFT JOIN ai_cache a ON e.id = a.email_id
      ORDER BY COALESCE(a.priority_score, 50) DESC, e.date DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  // Stats
  getStats() {
    const emailCount = this.db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number };
    const unreadCount = this.db.prepare('SELECT COUNT(*) as count FROM emails WHERE is_read = FALSE').get() as { count: number };
    const contactCount = this.db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };

    return {
      emails: emailCount.count,
      unread: unreadCount.count,
      contacts: contactCount.count
    };
  }

  setAICache(emailId: string, cache: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ai_cache
      (email_id, priority_score, priority_category, quick_replies, draft_suggestions)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      emailId,
      cache.priority_score || 50,
      cache.priority_category || 'normal',
      cache.quick_replies || '[]',
      cache.draft_suggestions || '[]'
    );
  }

  close(): void {
    this.db.close();
  }
}

export default DatabaseManager;