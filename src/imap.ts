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
}

class ImapManager {
  private imap: Imap | null = null;
  private config: any;
  private static instance: ImapManager;

  private constructor() {
    this.config = {
      user: process.env.EMAIL_ADDRESS || process.env.IMAP_USER,
      password: process.env.EMAIL_APP_PASSWORD || process.env.IMAP_PASSWORD,
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: true,
      authTimeout: 10000,
      connTimeout: 10000,
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
    if (this.imap && this.imap.state === 'authenticated') {
      return;
    }

    return new Promise((resolve, reject) => {
      this.imap = new Imap(this.config);

      this.imap.once('ready', () => {
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        reject(err);
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
      flags
    };
  }

  async getRecentEmails(days = 7, limit = 150): Promise<ParsedEmail[]> {
    try {
      await this.connect();
      await this.openBox('INBOX', true);

      // Calculate date for SINCE search
      const since = new Date();
      since.setDate(since.getDate() - days);

      // node-imap expects Date object in the criteria array
      const criteria = [['SINCE', since]];
      const uids = await this.searchUIDs(criteria);

      // Get most recent emails
      const limitedUids = uids.slice(-limit);

      const emails = await this.fetchEmails(limitedUids);

      // Sort by date (newest first)
      return emails.sort((a, b) => b.date.getTime() - a.date.getTime());

    } catch (error) {
      console.error('Email fetch failed:', error);
      throw error;
    } finally {
      this.disconnect();
    }
  }

  disconnect(): void {
    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }
  }
}

export default ImapManager;