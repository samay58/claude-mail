import nodemailer, { Transporter } from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';

interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
  bcc?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

class SMTPManager {
  private transporter: Transporter | null = null;
  private static instance: SMTPManager;
  private isConfigured: boolean = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): SMTPManager {
    if (!SMTPManager.instance) {
      SMTPManager.instance = new SMTPManager();
    }
    return SMTPManager.instance;
  }

  private initialize(): void {
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.EMAIL_ADDRESS || process.env.SMTP_USER;
    const smtpPassword = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD;

    if (!smtpUser || !smtpPassword) {
      console.warn('⚠️ SMTP credentials not configured. Email sending will not work.');
      console.warn('Set EMAIL_ADDRESS and EMAIL_APP_PASSWORD environment variables.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // Use TLS for port 465
        auth: {
          user: smtpUser,
          pass: smtpPassword
        },
        tls: {
          // Do not fail on invalid certs
          rejectUnauthorized: false
        }
      });

      // Verify connection configuration
      if (this.transporter) {
        this.transporter.verify((error, success) => {
          if (error) {
            console.error('SMTP connection error:', error);
            this.isConfigured = false;
          } else {
            console.log('✅ SMTP server ready to send emails');
            this.isConfigured = true;
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize SMTP:', error);
      this.isConfigured = false;
    }
  }

  isReady(): boolean {
    return this.isConfigured && this.transporter !== null;
  }

  async sendEmail(message: EmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isReady() || !this.transporter) {
      return {
        success: false,
        error: 'SMTP not configured. Please set EMAIL_ADDRESS and EMAIL_APP_PASSWORD.'
      };
    }

    const fromAddress = process.env.EMAIL_ADDRESS || process.env.SMTP_USER;

    const mailOptions = {
      from: fromAddress,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      cc: message.cc,
      bcc: message.bcc,
      attachments: message.attachments
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✉️ Email sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Failed to send email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async sendReply(
    originalMessageId: string,
    to: string,
    subject: string,
    body: string,
    references?: string[]
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isReady() || !this.transporter) {
      return {
        success: false,
        error: 'SMTP not configured'
      };
    }

    const fromAddress = process.env.EMAIL_ADDRESS || process.env.SMTP_USER;

    const mailOptions = {
      from: fromAddress,
      to: to,
      subject: subject,
      text: body,
      inReplyTo: originalMessageId,
      references: references ? references.join(' ') : originalMessageId,
      headers: {
        'In-Reply-To': originalMessageId,
        'References': references ? references.join(' ') : originalMessageId
      }
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✉️ Reply sent successfully:', info.messageId);

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Failed to send reply:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      console.error('SMTP transporter not initialized');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ SMTP connection test successful');
      return true;
    } catch (error) {
      console.error('SMTP connection test failed:', error);
      return false;
    }
  }

  // Format email body with proper quoting for replies
  static formatReplyBody(
    newContent: string,
    originalEmail: {
      from: string;
      date: string;
      body: string;
    }
  ): string {
    const quotedOriginal = originalEmail.body
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');

    return `${newContent}

On ${originalEmail.date}, ${originalEmail.from} wrote:
${quotedOriginal}`;
  }

  // Format email body for forwarding
  static formatForwardBody(
    newContent: string,
    originalEmail: {
      from: string;
      to: string;
      date: string;
      subject: string;
      body: string;
    }
  ): string {
    return `${newContent}

---------- Forwarded message ----------
From: ${originalEmail.from}
To: ${originalEmail.to}
Date: ${originalEmail.date}
Subject: ${originalEmail.subject}

${originalEmail.body}`;
  }
}

export default SMTPManager;
export type { EmailMessage };