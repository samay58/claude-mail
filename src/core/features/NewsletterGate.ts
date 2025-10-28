/**
 * NewsletterGate - RFC 2369/2919 compliant newsletter detection
 *
 * Detects newsletters and auto-generated marketing emails using:
 * - List-Unsubscribe header (RFC 2369)
 * - List-ID header (RFC 2919)
 * - Sender patterns (no-reply, noreply, etc.)
 * - Common newsletter domains
 */

export interface EmailHeaders {
  'list-unsubscribe'?: string;
  'list-id'?: string;
  'list-post'?: string;
  'list-help'?: string;
  'list-subscribe'?: string;
  'list-archive'?: string;
  'precedence'?: string;
  'x-campaign-id'?: string;
  'x-mailchimp-campaign'?: string;
  [key: string]: string | undefined;
}

export interface NewsletterDetectionResult {
  isNewsletter: boolean;
  confidence: number; // 0.0 to 1.0
  reasons: string[];
}

export class NewsletterGate {
  // RFC 2369 List-* headers that indicate mailing lists
  private static readonly LIST_HEADERS = [
    'list-unsubscribe',
    'list-id',
    'list-post',
    'list-help',
    'list-subscribe',
    'list-archive'
  ];

  // Marketing/Campaign headers
  private static readonly CAMPAIGN_HEADERS = [
    'x-campaign-id',
    'x-mailchimp-campaign',
    'x-sendgrid-id',
    'x-mailjet-campaign',
    'x-constantcontact-id'
  ];

  // No-reply sender patterns (case-insensitive)
  private static readonly NO_REPLY_PATTERNS = [
    /^no[-_.]?reply/i,
    /^do[-_.]?not[-_.]?reply/i,
    /^notifications?/i,
    /^alerts?/i,
    /^news(?:letter)?/i,
    /^updates?/i,
    /^marketing/i,
    /^info@/i,
    /^hello@/i,
    /^team@/i,
    /^support@/i,
    /^help@/i
  ];

  // Common newsletter/marketing domains
  private static readonly NEWSLETTER_DOMAINS = [
    'mailchimp.com',
    'sendgrid.net',
    'constantcontact.com',
    'mailjet.com',
    'sendinblue.com',
    'getresponse.com',
    'activecampaign.com',
    'convertkit.com',
    'drip.com',
    'aweber.com',
    'substack.com',
    'beehiiv.com',
    'buttondown.email',
    'revue.co',
    'tinyletter.com'
  ];

  /**
   * Main detection method - combines all detection strategies
   */
  static detect(
    senderEmail: string,
    headers?: EmailHeaders,
    subject?: string
  ): NewsletterDetectionResult {
    const reasons: string[] = [];
    let confidence = 0;

    // 1. Check List-* headers (RFC 2369/2919) - highest confidence
    if (headers) {
      const listHeaderResult = this.checkListHeaders(headers);
      if (listHeaderResult.found) {
        reasons.push(...listHeaderResult.reasons);
        confidence = Math.max(confidence, 0.95); // Very high confidence
      }

      // 2. Check campaign/marketing headers
      const campaignResult = this.checkCampaignHeaders(headers);
      if (campaignResult.found) {
        reasons.push(...campaignResult.reasons);
        confidence = Math.max(confidence, 0.90);
      }

      // 3. Check Precedence header
      if (headers['precedence']?.toLowerCase() === 'bulk' ||
          headers['precedence']?.toLowerCase() === 'list') {
        reasons.push('Precedence header indicates bulk mail');
        confidence = Math.max(confidence, 0.85);
      }
    }

    // 4. Check sender email patterns
    const senderResult = this.checkSenderPatterns(senderEmail);
    if (senderResult.found) {
      reasons.push(...senderResult.reasons);
      confidence = Math.max(confidence, 0.75);
    }

    // 5. Check if sender domain is a known newsletter service
    const domainResult = this.checkNewsletterDomain(senderEmail);
    if (domainResult.found) {
      reasons.push(...domainResult.reasons);
      confidence = Math.max(confidence, 0.85);
    }

    // 6. Check subject line patterns (lower confidence)
    if (subject) {
      const subjectResult = this.checkSubjectPatterns(subject);
      if (subjectResult.found) {
        reasons.push(...subjectResult.reasons);
        confidence = Math.max(confidence, 0.60);
      }
    }

    return {
      isNewsletter: confidence >= 0.60, // 60% confidence threshold
      confidence,
      reasons
    };
  }

  /**
   * Check for RFC 2369/2919 List-* headers
   */
  private static checkListHeaders(headers: EmailHeaders): { found: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let found = false;

    for (const header of this.LIST_HEADERS) {
      if (headers[header]) {
        found = true;
        reasons.push(`Has ${header.toUpperCase()} header (RFC ${header === 'list-id' ? '2919' : '2369'})`);
      }
    }

    return { found, reasons };
  }

  /**
   * Check for marketing/campaign headers
   */
  private static checkCampaignHeaders(headers: EmailHeaders): { found: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let found = false;

    for (const header of this.CAMPAIGN_HEADERS) {
      if (headers[header]) {
        found = true;
        reasons.push(`Has ${header.toUpperCase()} marketing header`);
      }
    }

    return { found, reasons };
  }

  /**
   * Check sender email against no-reply patterns
   */
  private static checkSenderPatterns(email: string): { found: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let found = false;

    const localPart = email.split('@')[0];

    for (const pattern of this.NO_REPLY_PATTERNS) {
      if (pattern.test(localPart)) {
        found = true;
        reasons.push(`Sender matches pattern: ${pattern.source}`);
        break; // One match is enough
      }
    }

    return { found, reasons };
  }

  /**
   * Check if email is from a known newsletter service
   */
  private static checkNewsletterDomain(email: string): { found: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let found = false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return { found, reasons };

    for (const newsletterDomain of this.NEWSLETTER_DOMAINS) {
      if (domain.includes(newsletterDomain)) {
        found = true;
        reasons.push(`From known newsletter service: ${newsletterDomain}`);
        break;
      }
    }

    return { found, reasons };
  }

  /**
   * Check subject line for newsletter patterns
   */
  private static checkSubjectPatterns(subject: string): { found: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let found = false;

    const newsletterPhrases = [
      /newsletter/i,
      /weekly digest/i,
      /monthly update/i,
      /daily brief/i,
      /\[.*\]/,  // Subjects with [brackets] often indicate lists
      /issue #\d+/i,
      /volume \d+/i,
      /edition \d+/i
    ];

    for (const pattern of newsletterPhrases) {
      if (pattern.test(subject)) {
        found = true;
        reasons.push(`Subject matches newsletter pattern: ${pattern.source}`);
        break;
      }
    }

    return { found, reasons };
  }

  /**
   * Utility method to extract headers from raw email (if needed)
   */
  static parseHeaders(rawHeaders: string): EmailHeaders {
    const headers: EmailHeaders = {};
    const lines = rawHeaders.split(/\r?\n/);
    let currentHeader = '';
    let currentValue = '';

    for (const line of lines) {
      if (line[0] === ' ' || line[0] === '\t') {
        // Continuation of previous header
        currentValue += ' ' + line.trim();
      } else {
        // Store previous header if exists
        if (currentHeader) {
          headers[currentHeader.toLowerCase()] = currentValue;
        }

        // Parse new header
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          currentHeader = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        } else {
          currentHeader = '';
          currentValue = '';
        }
      }
    }

    // Don't forget the last header
    if (currentHeader) {
      headers[currentHeader.toLowerCase()] = currentValue;
    }

    return headers;
  }
}