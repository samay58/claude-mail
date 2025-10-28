/**
 * OTPGate - OTP/2FA code detection (RFC 6238 TOTP and general patterns)
 *
 * Detects one-time passwords and two-factor authentication codes using:
 * - Common OTP patterns (6-8 digit codes)
 * - 2FA/MFA keywords
 * - Time-sensitivity indicators
 * - Security verification patterns
 */

export interface OTPInfo {
  code?: string;
  expiryMinutes?: number;
  service?: string;
  type: 'otp' | 'verification' | '2fa' | 'pin' | 'reset';
}

export interface OTPDetectionResult {
  hasOTP: boolean;
  confidence: number; // 0.0 to 1.0
  otpInfo?: OTPInfo;
  ageMinutes?: number; // How old the email is
  isExpired?: boolean; // If OTP is likely expired
  reasons: string[];
}

export class OTPGate {
  /**
   * Common OTP code patterns
   */
  private static readonly OTP_PATTERNS = [
    // 6-digit codes (most common)
    /\b(\d{6})\b/,
    // 4-digit PINs
    /\b(\d{4})\b/,
    // 8-digit codes
    /\b(\d{8})\b/,
    // Formatted codes (e.g., "123-456" or "12 34 56")
    /\b(\d{3}[-\s]\d{3})\b/,
    /\b(\d{2}\s\d{2}\s\d{2})\b/,
    // Alphanumeric codes
    /\b([A-Z0-9]{6,8})\b/
  ];

  /**
   * Keywords that indicate OTP/verification codes
   */
  private static readonly OTP_KEYWORDS = [
    // Direct indicators
    /verification code/i,
    /confirm(?:ation)? code/i,
    /security code/i,
    /authentication code/i,
    /one[- ]?time password/i,
    /otp/i,
    /2fa code/i,
    /mfa code/i,
    /two[- ]?factor/i,
    /pin code/i,
    /access code/i,
    /activation code/i,

    // Action-based
    /use (this |the following )?code/i,
    /enter (this |the following )?code/i,
    /your code is/i,
    /code:\s*\d+/i,
    /here('s| is) your code/i,

    // Platform-specific
    /sign[- ]?in code/i,
    /login code/i,
    /reset code/i,
    /recovery code/i,
    /temporary password/i,
    /single[- ]?use code/i
  ];

  /**
   * Time-sensitivity indicators
   */
  private static readonly TIME_INDICATORS = [
    /expires? in (\d+) minutes?/i,
    /valid for (\d+) minutes?/i,
    /use within (\d+) minutes?/i,
    /(\d+)[- ]?minutes? to use/i,
    /will expire/i,
    /time[- ]?sensitive/i,
    /act quickly/i,
    /immediate(?:ly)?/i,
    /expires? soon/i,
    /temporary/i,
    /do not share/i
  ];

  /**
   * Common services that send OTPs
   */
  private static readonly OTP_SERVICES = [
    // Social Media
    { pattern: /facebook|fb\.com/i, service: 'Facebook' },
    { pattern: /twitter|x\.com/i, service: 'Twitter/X' },
    { pattern: /instagram/i, service: 'Instagram' },
    { pattern: /linkedin/i, service: 'LinkedIn' },
    { pattern: /tiktok/i, service: 'TikTok' },

    // Tech Giants
    { pattern: /google|gmail/i, service: 'Google' },
    { pattern: /microsoft|outlook|hotmail/i, service: 'Microsoft' },
    { pattern: /apple|icloud/i, service: 'Apple' },
    { pattern: /amazon|aws/i, service: 'Amazon' },
    { pattern: /meta/i, service: 'Meta' },

    // Financial
    { pattern: /paypal/i, service: 'PayPal' },
    { pattern: /stripe/i, service: 'Stripe' },
    { pattern: /bank|chase|wells|citi|bofa/i, service: 'Banking' },
    { pattern: /venmo/i, service: 'Venmo' },
    { pattern: /cashapp|square/i, service: 'CashApp' },

    // Communication
    { pattern: /whatsapp/i, service: 'WhatsApp' },
    { pattern: /telegram/i, service: 'Telegram' },
    { pattern: /signal/i, service: 'Signal' },
    { pattern: /discord/i, service: 'Discord' },
    { pattern: /slack/i, service: 'Slack' },

    // Developer
    { pattern: /github/i, service: 'GitHub' },
    { pattern: /gitlab/i, service: 'GitLab' },
    { pattern: /bitbucket/i, service: 'Bitbucket' },
    { pattern: /npm/i, service: 'NPM' },
    { pattern: /docker/i, service: 'Docker' },

    // Other
    { pattern: /uber/i, service: 'Uber' },
    { pattern: /lyft/i, service: 'Lyft' },
    { pattern: /airbnb/i, service: 'Airbnb' },
    { pattern: /netflix/i, service: 'Netflix' },
    { pattern: /spotify/i, service: 'Spotify' }
  ];

  /**
   * Subject patterns that indicate OTP
   */
  private static readonly OTP_SUBJECT_PATTERNS = [
    /your? (verification|security|authentication|confirmation) code/i,
    /\d{4,8} is your/i,
    /code:\s*\d{4,8}/i,
    /verify your (account|email|phone|identity)/i,
    /confirm your (account|email|phone|identity)/i,
    /2fa|otp|mfa/i,
    /sign[- ]?in attempt/i,
    /password reset/i,
    /account recovery/i,
    /action required/i,
    /urgent.*security/i
  ];

  /**
   * Main detection method - combines all detection strategies
   */
  static detect(
    senderEmail: string,
    subject?: string,
    bodyText?: string,
    emailDate?: Date
  ): OTPDetectionResult {
    const reasons: string[] = [];
    let confidence = 0;
    let otpInfo: OTPInfo | undefined;
    let ageMinutes: number | undefined;
    let isExpired = false;

    // Calculate email age if date provided
    if (emailDate) {
      const now = new Date();
      ageMinutes = Math.floor((now.getTime() - emailDate.getTime()) / (1000 * 60));

      // OTPs typically expire in 5-15 minutes
      if (ageMinutes > 15) {
        isExpired = true;
      }
    }

    // 1. Check subject for OTP patterns
    if (subject) {
      for (const pattern of this.OTP_SUBJECT_PATTERNS) {
        if (pattern.test(subject)) {
          confidence = Math.max(confidence, 0.80);
          reasons.push(`Subject matches OTP pattern: ${pattern.source}`);
          break;
        }
      }

      // Check for codes directly in subject
      const codeInSubject = this.extractCode(subject);
      if (codeInSubject) {
        confidence = Math.max(confidence, 0.75);
        reasons.push(`Found potential code in subject: ${codeInSubject}`);
        if (!otpInfo) {
          otpInfo = { code: codeInSubject, type: 'otp' };
        }
      }
    }

    // 2. Check body for OTP keywords and codes
    if (bodyText) {
      // Limit search to first 500 chars for performance
      const bodySnippet = bodyText.substring(0, 500);

      // Check for OTP keywords
      let keywordMatches = 0;
      for (const keyword of this.OTP_KEYWORDS) {
        if (keyword.test(bodySnippet)) {
          keywordMatches++;
        }
      }

      if (keywordMatches > 0) {
        // Scale confidence based on keyword matches
        const keywordConfidence = Math.min(0.70 + (keywordMatches * 0.10), 0.95);
        confidence = Math.max(confidence, keywordConfidence);
        reasons.push(`Body contains ${keywordMatches} OTP keyword(s)`);

        // Extract the actual code
        const extractedCode = this.extractCode(bodySnippet, true);
        if (extractedCode) {
          confidence = Math.max(confidence, 0.90);
          reasons.push(`Found code: ${extractedCode}`);

          if (!otpInfo) {
            otpInfo = {
              code: extractedCode,
              type: this.determineOTPType(bodySnippet)
            };
          }
        }
      }

      // Check for time sensitivity
      const expiryInfo = this.extractExpiryTime(bodySnippet);
      if (expiryInfo) {
        confidence = Math.max(confidence, 0.85);
        reasons.push(`Code expires in ${expiryInfo.minutes} minutes`);
        if (otpInfo) {
          otpInfo.expiryMinutes = expiryInfo.minutes;
        }

        // Check if already expired
        if (ageMinutes && ageMinutes > expiryInfo.minutes) {
          isExpired = true;
        }
      }

      // Check for time-sensitive language
      for (const pattern of this.TIME_INDICATORS) {
        if (pattern.test(bodySnippet)) {
          confidence = Math.max(confidence, 0.75);
          reasons.push('Contains time-sensitive language');
          break;
        }
      }
    }

    // 3. Check sender for known OTP services
    const service = this.identifyService(senderEmail, bodyText);
    if (service) {
      confidence = Math.max(confidence, 0.70);
      reasons.push(`From known service: ${service}`);
      if (otpInfo) {
        otpInfo.service = service;
      }
    }

    // 4. Check for security/no-reply sender patterns
    const securitySenderPatterns = [
      /security@/i,
      /no[- ]?reply@/i,
      /verification@/i,
      /authenticate@/i,
      /2fa@/i,
      /otp@/i,
      /accounts?@/i
    ];

    for (const pattern of securitySenderPatterns) {
      if (pattern.test(senderEmail)) {
        confidence = Math.max(confidence, 0.65);
        reasons.push('From security/no-reply address');
        break;
      }
    }

    // 5. Adjust confidence if email is old
    if (isExpired) {
      reasons.push('OTP likely expired (email too old)');
      // Don't reduce confidence of detection, just mark as expired
    }

    return {
      hasOTP: confidence >= 0.65, // 65% confidence threshold
      confidence,
      otpInfo: confidence >= 0.65 ? otpInfo : undefined,
      ageMinutes,
      isExpired,
      reasons
    };
  }

  /**
   * Extract OTP code from text
   */
  private static extractCode(text: string, preferNearKeywords = false): string | null {
    // If we should prefer codes near keywords
    if (preferNearKeywords) {
      // Look for patterns like "code: 123456" or "Your code is 123456"
      const contextPatterns = [
        /code:?\s*(\d{4,8})/i,
        /is:?\s*(\d{4,8})/i,
        /:\s*(\d{4,8})/,
        /\b(\d{6})\b.*(?:code|otp|verification|pin)/i,
        /(?:code|otp|verification|pin).*\b(\d{6})\b/i
      ];

      for (const pattern of contextPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
    }

    // Fallback to finding any code pattern
    for (const pattern of this.OTP_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const code = match[1];
        // Basic validation - not a year, phone number, or price
        if (code.length === 4) {
          const num = parseInt(code);
          if (num < 1900 || num > 2100) {
            return code; // Not a year
          }
        } else {
          return code;
        }
      }
    }

    return null;
  }

  /**
   * Extract expiry time from text
   */
  private static extractExpiryTime(text: string): { minutes: number } | null {
    const patterns = [
      /expires? in (\d+) minutes?/i,
      /valid for (\d+) minutes?/i,
      /(\d+)[- ]?minutes? to use/i,
      /use within (\d+) minutes?/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return { minutes: parseInt(match[1]) };
      }
    }

    // Check for hour-based expiry
    const hourPattern = /expires? in (\d+) hours?/i;
    const hourMatch = text.match(hourPattern);
    if (hourMatch && hourMatch[1]) {
      return { minutes: parseInt(hourMatch[1]) * 60 };
    }

    return null;
  }

  /**
   * Identify the service sending the OTP
   */
  private static identifyService(senderEmail: string, bodyText?: string): string | null {
    const searchText = `${senderEmail} ${bodyText || ''}`.toLowerCase();

    for (const { pattern, service } of this.OTP_SERVICES) {
      if (pattern.test(searchText)) {
        return service;
      }
    }

    return null;
  }

  /**
   * Determine the type of OTP based on content
   */
  private static determineOTPType(text: string): OTPInfo['type'] {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('reset') || lowerText.includes('recover')) {
      return 'reset';
    }
    if (lowerText.includes('pin')) {
      return 'pin';
    }
    if (lowerText.includes('2fa') || lowerText.includes('two') || lowerText.includes('second')) {
      return '2fa';
    }
    if (lowerText.includes('verif')) {
      return 'verification';
    }

    return 'otp';
  }

  /**
   * Calculate OTP urgency score (0.0 to 1.0)
   */
  static calculateUrgency(emailDate: Date, expiryMinutes = 10): number {
    const now = new Date();
    const ageMinutes = (now.getTime() - emailDate.getTime()) / (1000 * 60);

    if (ageMinutes >= expiryMinutes) {
      return 0; // Expired
    }

    // Linear decay from 1.0 to 0 as time approaches expiry
    return Math.max(0, 1 - (ageMinutes / expiryMinutes));
  }
}