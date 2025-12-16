import Imap from 'node-imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { createHash } from 'crypto';

export interface ParsedEmail {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string }[];
  date: Date;
  bodyText?: string;
  bodyHtml?: string;
  snippet: string;
  isRead: boolean;
  flags: string[];
  folder?: string; // IMAP folder name (INBOX, [Gmail]/Sent Mail, etc.)
  folderType?: string; // 'inbox', 'sent', or 'other'
  // RFC headers for scoring (extracted during sync)
  rfcHeaders?: {
    listUnsubscribe?: string;  // RFC 2369
    listId?: string;           // RFC 2919
    autoSubmitted?: string;    // RFC 3834
    contentType?: string;      // For calendar detection
  };
}

// Connection state enum
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

class ImapManager {
  private imap: Imap | null = null;
  private config: any;
  private static instance: ImapManager;

  // Connection management
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastConnectionError: Error | null = null;

  private constructor() {
    this.config = {
      user: process.env.EMAIL_ADDRESS || process.env.IMAP_USER,
      password: process.env.EMAIL_APP_PASSWORD || process.env.IMAP_PASSWORD,
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: true,
      authTimeout: 60000,    // 60 seconds for large syncs
      connTimeout: 60000,    // 60 seconds for large syncs
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true
      }
    };

    if (!this.config.user || !this.config.password) {
      throw new Error('EMAIL_ADDRESS and EMAIL_APP_PASSWORD must be set in .env');
    }
  }

  static getInstance(): ImapManager {
    if (!ImapManager.instance) {
      ImapManager.instance = new ImapManager();
    }
    return ImapManager.instance;
  }

  private async connect(): Promise<void> {
    if (this.imap && this.imap.state === 'authenticated' && this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    // Clear any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connectionState = ConnectionState.CONNECTING;

    return new Promise((resolve, reject) => {
      this.imap = new Imap(this.config);

      this.imap.once('ready', () => {
        console.log('[IMAP] Connected successfully');
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        this.lastConnectionError = null;
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        console.error('[IMAP] Connection error:', err.message);
        this.connectionState = ConnectionState.ERROR;
        this.lastConnectionError = err;
        reject(err);
      });

      // Add persistent error handler for connection drops
      this.imap.on('error', (err: Error) => {
        console.error('[IMAP] Runtime error:', err.message);
        this.connectionState = ConnectionState.ERROR;
        this.lastConnectionError = err;
        this.scheduleReconnect();
      });

      // Handle connection end
      this.imap.on('end', () => {
        console.log('[IMAP] Connection ended');
        if (this.connectionState === ConnectionState.CONNECTED) {
          // Unexpected disconnect
          this.connectionState = ConnectionState.DISCONNECTED;
          this.scheduleReconnect();
        }
      });

      this.imap.connect();
    });
  }

  private async openBox(boxName = 'INBOX', readOnly = true): Promise<Imap.Box> {
    if (!this.imap) {
      throw new Error('IMAP not connected');
    }

    return new Promise((resolve, reject) => {
      this.imap!.openBox(boxName, readOnly, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  private async searchUIDs(criteria: any[]): Promise<number[]> {
    if (!this.imap) {
      throw new Error('IMAP not connected');
    }

    return new Promise((resolve, reject) => {
      this.imap!.search(criteria, (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      });
    });
  }

  private async fetchEmails(uids: number[]): Promise<ParsedEmail[]> {
    if (!this.imap || uids.length === 0) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const emails: ParsedEmail[] = [];
      const fetch = this.imap!.fetch(uids, {
        bodies: '',
        struct: true,
        envelope: true
      });

      fetch.on('message', (msg) => {
        let buffer = '';
        let attributes: any = null;

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('attributes', (attrs) => {
          attributes = attrs;
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            const email = this.parseEmailMessage(parsed, attributes);
            emails.push(email);
          } catch (err) {
            console.error('Error parsing email:', err);
          }
        });
      });

      fetch.once('error', reject);
      fetch.once('end', () => resolve(emails));
    });
  }

  private parseEmailMessage(parsed: ParsedMail, attributes: any): ParsedEmail {
    const messageId = parsed.messageId || attributes.envelope?.messageId || '';
    const id = createHash('md5').update(messageId).digest('hex');

    // Extract thread ID (Gmail-specific)
    const threadId = attributes['x-gm-thrid']?.toString() || id;

    // Parse sender
    const fromAddr = parsed.from?.value?.[0];
    const from = {
      email: fromAddr?.address || 'unknown@example.com',
      name: fromAddr?.name
    };

    // Parse recipients
    const toAddresses = Array.isArray(parsed.to) ? parsed.to : (parsed.to ? [parsed.to] : []);
    const to = toAddresses.flatMap(addr =>
      (addr?.value || []).map((a: any) => ({
        email: a.address,
        name: a.name
      })));

    // Create snippet
    const text = parsed.text || '';
    const snippet = text.length > 200 ? text.substring(0, 200) + '...' : text;

    // Check if read (based on flags)
    const flags = attributes.flags || [];
    const isRead = flags.includes('\\Seen');

    // Extract RFC headers for scoring
    // mailparser's headers is a Map; some values are objects, some strings
    const headers = parsed.headers;

    // Helper to extract string value from potentially complex header
    const getHeaderString = (headerValue: any): string | undefined => {
      if (!headerValue) return undefined;
      if (typeof headerValue === 'string') return headerValue;
      // Structured headers (like Content-Type) have a 'value' property
      if (headerValue.value) return headerValue.value;
      // Arrays (like multiple List-Unsubscribe values)
      if (Array.isArray(headerValue)) return headerValue.map(v => v?.value || v).join(', ');
      return String(headerValue);
    };

    // mailparser combines List-* headers into a single 'list' object
    // e.g., { unsubscribe: {url: "..."}, id: {name: "..."}, ... }
    const listHeaders = headers?.get('list') as any;

    const rfcHeaders = {
      // Extract from combined 'list' object
      listUnsubscribe: listHeaders?.unsubscribe?.url || listHeaders?.unsubscribe?.mail || undefined,
      listId: listHeaders?.id?.name || undefined,
      // Auto-Submitted is a separate header
      autoSubmitted: getHeaderString(headers?.get('auto-submitted')),
      contentType: getHeaderString(headers?.get('content-type'))
    };

    return {
      id,
      threadId,
      messageId,
      subject: parsed.subject || '(no subject)',
      from,
      to,
      date: parsed.date || new Date(),
      bodyText: parsed.text,
      bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
      snippet,
      isRead,
      flags,
      rfcHeaders
    };
  }

  /**
   * Determine folder type from folder name
   */
  private getFolderType(folderName: string): string {
    const normalized = folderName.toLowerCase();
    if (normalized === 'inbox') return 'inbox';
    if (normalized.includes('sent')) return 'sent';
    if (normalized.includes('draft')) return 'draft';
    if (normalized.includes('trash') || normalized.includes('deleted')) return 'trash';
    return 'other';
  }

  /**
   * Fetch emails from a specific folder
   */
  private async getRecentEmailsFromFolder(
    folderName: string,
    days = 7,
    limit = 150
  ): Promise<ParsedEmail[]> {
    try {
      await this.ensureConnected();
      await this.openBox(folderName, true);

      // Calculate date for SINCE search
      const since = new Date();
      since.setDate(since.getDate() - days);

      const criteria = [['SINCE', since]];
      const uids = await this.searchUIDs(criteria);

      // Get most recent emails
      const limitedUids = uids.slice(-limit);
      const emails = await this.fetchEmails(limitedUids);

      // Add folder metadata to each email
      const folderType = this.getFolderType(folderName);
      return emails.map(email => ({
        ...email,
        folder: folderName,
        folderType
      }));

    } catch (error) {
      console.error(`Email fetch failed from ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Fetch emails from INBOX (backward compatibility)
   */
  async getRecentEmails(days = 7, limit = 150): Promise<ParsedEmail[]> {
    const emails = await this.getRecentEmailsFromFolder('INBOX', days, limit);
    // Sort by date (newest first)
    return emails.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Fetch emails from both INBOX and SENT folders
   */
  async syncAllFolders(days = 7, inboxLimit = 150, sentLimit = 50): Promise<{
    inbox: ParsedEmail[];
    sent: ParsedEmail[];
  }> {
    try {
      // Sync INBOX
      const inboxEmails = await this.getRecentEmailsFromFolder('INBOX', days, inboxLimit);

      // Sync SENT folder (Gmail uses [Gmail]/Sent Mail, others may use SENT or Sent Items)
      let sentEmails: ParsedEmail[] = [];
      const sentFolders = ['[Gmail]/Sent Mail', 'Sent', 'SENT', 'Sent Items'];

      for (const sentFolder of sentFolders) {
        try {
          sentEmails = await this.getRecentEmailsFromFolder(sentFolder, days, sentLimit);
          console.log(`✓ Found SENT folder: ${sentFolder}`);
          break; // Stop on first successful folder
        } catch (error: any) {
          // Folder doesn't exist, try next one
          if (error.message?.includes('does not exist') || error.message?.includes('Mailbox doesn\'t exist')) {
            continue;
          }
          throw error; // Re-throw if it's a different error
        }
      }

      if (sentEmails.length === 0) {
        console.warn('⚠️  No SENT folder found. Relationship scoring may be inaccurate.');
      }

      return {
        inbox: inboxEmails.sort((a, b) => b.date.getTime() - a.date.getTime()),
        sent: sentEmails.sort((a, b) => b.date.getTime() - a.date.getTime())
      };

    } catch (error) {
      console.error('Sync all folders failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.connectionState = ConnectionState.DISCONNECTED;

    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }
  }

  /**
   * Schedules a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    // Don't schedule if already scheduled or if we've exceeded max attempts
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[IMAP] Max reconnection attempts reached. Manual intervention required.');
      }
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[IMAP] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Attempts to reconnect to IMAP server
   */
  private async reconnect(): Promise<void> {
    this.reconnectTimer = null;
    this.connectionState = ConnectionState.RECONNECTING;

    console.log('[IMAP] Attempting to reconnect...');

    try {
      // Clean up old connection
      if (this.imap) {
        this.imap.removeAllListeners();
        this.imap.end();
        this.imap = null;
      }

      // Attempt new connection
      await this.connect();
      console.log('[IMAP] Reconnection successful');
    } catch (error) {
      console.error('[IMAP] Reconnection failed:', error);
      // scheduleReconnect() will be called by the error handler in connect()
    }
  }

  /**
   * Ensures IMAP connection is established before operations
   * Automatically reconnects if disconnected
   */
  private async ensureConnected(): Promise<void> {
    // If already connected, return immediately
    if (this.connectionState === ConnectionState.CONNECTED && this.imap && this.imap.state === 'authenticated') {
      return;
    }

    // If currently connecting or reconnecting, wait a bit and retry
    if (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.RECONNECTING) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.ensureConnected();
    }

    // If disconnected or error state, attempt connection
    if (this.connectionState === ConnectionState.DISCONNECTED || this.connectionState === ConnectionState.ERROR) {
      console.log('[IMAP] Connection not established, connecting...');
      await this.connect();
    }
  }

  /**
   * Get current connection status (for debugging/monitoring)
   */
  getConnectionStatus(): { state: string; error: string | null } {
    return {
      state: this.connectionState,
      error: this.lastConnectionError?.message || null
    };
  }

  /**
   * Fetch historical SENT emails for relationship backfill
   *
   * This method is designed for one-time backfill to populate sender_relationships
   * with 6 months of email history.
   *
   * @param months Number of months to look back (default: 6)
   * @param progressCallback Optional callback for progress reporting
   * @returns All sent emails from the specified time period
   */
  async getHistoricalSentEmails(
    months: number = 6,
    progressCallback?: (count: number, total: number) => void
  ): Promise<ParsedEmail[]> {
    try {
      await this.ensureConnected();

      // Try different SENT folder names
      const sentFolders = ['[Gmail]/Sent Mail', 'Sent', 'SENT', 'Sent Items'];
      let sentFolder: string | null = null;

      for (const folder of sentFolders) {
        try {
          await this.openBox(folder, true);
          sentFolder = folder;
          console.log(`[Backfill] Using SENT folder: ${folder}`);
          break;
        } catch (error: any) {
          if (error.message?.includes('does not exist') || error.message?.includes('Mailbox doesn\'t exist')) {
            continue;
          }
          throw error;
        }
      }

      if (!sentFolder) {
        throw new Error('No SENT folder found. Cannot perform backfill.');
      }

      // Calculate date range
      const since = new Date();
      since.setMonth(since.getMonth() - months);

      console.log(`[Backfill] Fetching sent emails since ${since.toISOString()}`);

      // Search for all emails in range
      const criteria = [['SINCE', since]];
      const allUids = await this.searchUIDs(criteria);

      console.log(`[Backfill] Found ${allUids.length} sent emails to process`);

      if (allUids.length === 0) {
        return [];
      }

      // Process in batches to avoid memory issues
      const batchSize = 100;
      const allEmails: ParsedEmail[] = [];

      for (let i = 0; i < allUids.length; i += batchSize) {
        const batchUids = allUids.slice(i, i + batchSize);
        const batchEmails = await this.fetchEmails(batchUids);

        // Add folder metadata
        batchEmails.forEach(email => {
          email.folder = sentFolder!;
          email.folderType = 'sent';
        });

        allEmails.push(...batchEmails);

        // Report progress
        if (progressCallback) {
          progressCallback(allEmails.length, allUids.length);
        }
      }

      // Sort by date (oldest first for relationship building)
      return allEmails.sort((a, b) => a.date.getTime() - b.date.getTime());

    } catch (error) {
      console.error('[Backfill] Failed to fetch historical sent emails:', error);
      throw error;
    }
  }
}

export default ImapManager;