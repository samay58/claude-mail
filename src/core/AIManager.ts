import Anthropic from '@anthropic-ai/sdk';
import { EmailRecord } from '../database.js';
import ConfigManager from '../config.js';

interface EmailPriority {
  score: number; // 0-100
  reason: string;
  category: 'urgent' | 'important' | 'normal' | 'low' | 'spam';
  suggestedAction?: string;
}

interface DraftSuggestion {
  subject?: string;
  body: string;
  tone: 'formal' | 'casual' | 'friendly' | 'professional' | 'brief';
  confidence: number;
}

interface EmailSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
}

interface SenderProfile {
  email: string;
  name?: string;
  relationship: string;
  communicationStyle: string;
  typicalTopics: string[];
  responseTimeExpectation: string;
}

class AIManager {
  private anthropic: Anthropic;
  private static instance: AIManager;
  private apiKey: string;

  private constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!this.apiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set. AI features will be limited.');
      // Create a dummy client for now
      this.anthropic = {} as Anthropic;
    } else {
      this.anthropic = new Anthropic({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Helper to create cacheable content for prompt caching (90% cost reduction)
   * Marks static instructions as cacheable, dynamic email content as non-cacheable
   */
  private createCacheableMessages(systemInstruction: string, emailContent: string) {
    return [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: systemInstruction,
            cache_control: { type: 'ephemeral' as const }
          },
          {
            type: 'text' as const,
            text: emailContent
          }
        ]
      }
    ];
  }

  static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // Enhanced heuristic-based prioritization for when AI is not available
  private heuristicPrioritize(email: EmailRecord): EmailPriority {
    const subject = email.subject.toLowerCase();
    const body = (email.body_text || email.snippet || '').toLowerCase();
    const sender = email.sender_email.toLowerCase();
    const senderDomain = sender.split('@')[1] || '';
    const senderName = (email.sender_name || '').toLowerCase();

    console.log(`\n🤖 Heuristic analysis: "${email.subject}" from ${sender}`);

    let score: number;
    let category: 'urgent' | 'important' | 'normal' | 'low' | 'spam';
    const reasons: string[] = [];

    // STEP 1: Detect email type and set base score (don't start everything at 50!)

    // 2FA / OTP Tokens (time-sensitive but automated)
    if (subject.includes('verification code') || subject.includes('otp') ||
        body.includes('verification code') || body.includes('one-time password') ||
        /\b\d{4,6}\b/.test(subject) || body.includes('security code')) {
      score = 35;
      category = 'low';
      reasons.push('2FA/OTP token');
    }
    // Security alerts (NOT 2FA - actual security concerns)
    else if (subject.includes('unusual sign-in') || subject.includes('suspicious activity') ||
             subject.includes('security alert') || subject.includes('account breach') ||
             subject.includes('unauthorized access')) {
      score = 90;
      category = 'urgent';
      reasons.push('Security alert');
    }
    // Marketing/Promotional
    else if (body.includes('unsubscribe') || subject.includes('sale') || subject.includes('% off') ||
             subject.includes('deal') || subject.includes('offer') || subject.includes('promo') ||
             sender.includes('marketing') || sender.includes('promo')) {
      score = 25;
      category = 'spam';
      reasons.push('Marketing email');
    }
    // Newsletters
    else if (subject.includes('newsletter') || subject.includes('weekly digest') ||
             subject.includes('daily brief') || sender.includes('newsletter')) {
      score = 35;
      category = 'low';
      reasons.push('Newsletter');
    }
    // Transactional (receipts, confirmations)
    else if (subject.includes('receipt') || subject.includes('order confirmation') ||
             subject.includes('your order') || subject.includes('has shipped') ||
             subject.includes('invoice') || subject.includes('payment received')) {
      score = 45;
      category = 'normal';
      reasons.push('Transactional email');
    }
    // Automated notifications (noreply, etc.)
    else if (sender.includes('noreply') || sender.includes('no-reply') ||
             sender.includes('donotreply') || sender.includes('notification@')) {
      score = 40;
      category = 'low';
      reasons.push('Automated notification');
    }
    // Human-written emails start higher
    else {
      score = 60; // Human emails get benefit of doubt
      category = 'normal';
      reasons.push('Likely human-written');
    }

    // STEP 2: Adjust score based on content urgency

    // Urgent keywords
    const urgentKeywords = ['urgent', 'asap', 'immediate', 'critical', 'emergency', 'deadline'];
    if (urgentKeywords.some(kw => subject.includes(kw) || body.includes(kw))) {
      score += 25;
      reasons.push('Urgent keywords');
    }

    // Action required
    const actionKeywords = ['action required', 'please review', 'approval needed', 'response needed'];
    if (actionKeywords.some(kw => subject.includes(kw) || body.includes(kw))) {
      score += 20;
      reasons.push('Action required');
    }

    // Meeting/calendar
    if (subject.includes('meeting') || subject.includes('calendar') ||
        subject.includes('invitation') || subject.includes('schedule')) {
      score += 15;
      reasons.push('Meeting related');
    }

    // Questions (implies needing response)
    if (subject.includes('?') || body.includes('can you') || body.includes('could you') ||
        body.includes('would you') || body.includes('will you')) {
      score += 10;
      reasons.push('Contains question');
    }

    // STEP 3: Sender-based adjustments

    // Security-related senders
    if (sender.includes('security@') || sender.includes('alert@')) {
      score += 30;
      reasons.push('Security sender');
    }

    // Important domains
    const importantDomains = ['.gov', '.edu'];
    if (importantDomains.some(domain => senderDomain.endsWith(domain))) {
      score += 10;
      reasons.push('Important domain');
    }

    // STEP 4: Final categorization based on score
    if (score >= 90) category = 'urgent';
    else if (score >= 70) category = 'important';
    else if (score >= 50) category = 'normal';
    else if (score >= 30) category = 'low';
    else category = 'spam';

    // Cap score between 0-100
    score = Math.max(0, Math.min(100, score));

    console.log(`   Score: ${score}, Category: ${category}, Reasons: [${reasons.join(', ')}]`);

    return {
      score,
      category,
      reason: reasons.join(', '),
      suggestedAction: score >= 70 ? 'Reply within 24 hours' : undefined
    };
  }

  async prioritizeEmail(email: EmailRecord): Promise<EmailPriority> {
    // Quick heuristic-based prioritization when AI not configured
    if (!this.isConfigured()) {
      return this.heuristicPrioritize(email);
    }

    try {
      const senderEmail = email.sender_email.toLowerCase();
      const senderDomain = senderEmail.split('@')[1] || '';

      // Split into cacheable instructions and dynamic email content
      const systemInstruction = `Analyze emails intelligently and respond with ONLY valid JSON - no other text.

CRITICAL: Distinguish between these email types:

1. MARKETING/PROMOTIONAL (score: 20-35)
   - Mass emails, sales, promotions, "limited time offer"
   - Contains "unsubscribe", "shop now", "deal", "discount"
   - Example: "Flash Sale: 50% Off Today!" → score: 25

2. NEWSLETTERS (score: 30-45)
   - Regular updates, curated content, industry news
   - From known publishers, blogs, communities
   - Example: "Your weekly digest from TechCrunch" → score: 35

3. AUTOMATED NOTIFICATIONS (score: 30-50)
   - From noreply@, notifications@, automated systems
   - Social media likes, follows, comments
   - Example: "GitHub: New comment on your issue" → score: 40

4. 2FA/OTP TOKENS (score: 35-40)
   - Verification codes, one-time passwords
   - Time-sensitive but automated, not urgent
   - Example: "Your verification code is 123456" → score: 35

5. TRANSACTIONAL (score: 40-60)
   - Receipts, order confirmations, shipping updates
   - Account updates, password changes completed
   - Example: "Your order #12345 has shipped" → score: 45

6. SECURITY ALERTS (score: 85-95)
   - Unusual sign-in, suspicious activity, account breaches
   - NOT 2FA codes - actual security concerns
   - Example: "Unusual sign-in detected from Russia" → score: 90

7. HUMAN-WRITTEN WORK EMAILS (score: 60-90)
   - Personal messages from colleagues, clients, managers
   - Meeting requests, project discussions, questions
   - Example: "Can we reschedule tomorrow's meeting?" → score: 75

8. URGENT ACTION REQUIRED (score: 85-95)
   - Deadlines, time-sensitive decisions, emergencies
   - Direct requests from VIPs/managers
   - Example: "Need your approval by 5pm today" → score: 90

SENDER ANALYSIS:
- If sender contains "noreply", "no-reply", "donotreply": Likely automated (lower priority)
- If sender contains "security", "alert": Likely important security message
- If sender contains "marketing", "promo", "newsletter": Lower priority
- If from corporate domain (.gov, .edu, major companies): Slightly higher priority
- If personal human name in sender: Likely important

SCORING RULES:
- Don't default to 50 - assign meaningful scores based on email type
- Marketing/spam should be 20-35, NOT 50
- Automated notifications should be 30-50, NOT 50
- Only human-written emails should be 60+
- Be decisive - use the full 0-100 range

Return JSON with this exact format:
{
  "score": 35,
  "category": "low",
  "reason": "Newsletter - automated content digest"
}

Categories: urgent, important, normal, low, spam`;

      const emailContent = `EMAIL DETAILS:
From: ${email.sender_name || email.sender_email}
Sender Email: ${email.sender_email}
Subject: ${email.subject}
Body: ${email.body_text?.substring(0, 600) || email.snippet}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: this.createCacheableMessages(systemInstruction, emailContent),
        temperature: 0.3
      });

      const content = response.content[0];
      if (content.type === 'text') {
        console.log(`🤖 Claude response: ${content.text}`);
        try {
          // Clean the response text (remove any non-JSON content)
          const jsonMatch = content.text.match(/\{[^}]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : content.text;

          const parsed = JSON.parse(jsonStr);
          const result = {
            score: Math.max(0, Math.min(100, parsed.score || 50)),
            reason: parsed.reason || 'AI analysis',
            category: parsed.category || 'normal',
            suggestedAction: parsed.suggestedAction
          };

          console.log(`   ✅ AI Priority: ${result.score} (${result.category}) - ${result.reason}`);
          return result;
        } catch (parseError) {
          console.error(`   ❌ JSON parse failed: ${parseError}`);
          console.log(`   🔄 Falling back to heuristic for: ${email.subject}`);
          // Fallback to heuristic
          return this.heuristicPrioritize(email);
        }
      }
    } catch (error) {
      console.error('Error prioritizing email:', error);
    }

    return {
      score: 50,
      reason: 'Default priority',
      category: 'normal'
    };
  }

  async generateDraftSuggestions(
    originalEmail: EmailRecord,
    mode: 'reply' | 'replyAll' | 'forward',
    userGist?: string
  ): Promise<DraftSuggestion[]> {
    if (!this.isConfigured()) {
      // Return default suggestions with proper signatures
      const config = ConfigManager.getInstance();
      return [
        {
          body: `Thank you for your email. I'll review this and get back to you soon.\n\n${config.getSignature('formal')}`,
          tone: 'formal',
          confidence: 0.8
        },
        {
          body: `Thanks for reaching out! I'll take a look and respond shortly.\n\n${config.getSignature('casual')}`,
          tone: 'casual',
          confidence: 0.8
        },
        {
          body: `Got it, will respond soon.\n\n${config.getSignature('brief')}`,
          tone: 'brief',
          confidence: 0.7
        }
      ];
    }

    try {
      const config = ConfigManager.getInstance();
      const prompt = `Generate 3 different email ${mode} suggestions.

Original Email:
From: ${originalEmail.sender_name || originalEmail.sender_email}
Subject: ${originalEmail.subject}
Body: ${originalEmail.body_text?.substring(0, 800) || originalEmail.snippet}

${userGist ? `User wants to say: "${userGist}"` : ''}

User Context: ${config.getPersonalizedContext()}

Create 3 variations with these exact signatures:
1. Formal: End with "${config.getSignature('formal')}"
2. Casual: End with "${config.getSignature('casual')}"
3. Brief: End with "${config.getSignature('brief')}"

Return JSON array: [{"body": "...", "tone": "formal", "confidence": 0.9}]`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const parsed = JSON.parse(content.text);
          return parsed.suggestions || [];
        } catch {
          // Try to extract suggestions from text
          return [{
            body: content.text,
            tone: 'professional',
            confidence: 0.7
          }];
        }
      }
    } catch (error) {
      console.error('Error generating drafts:', error);
    }

    return [];
  }

  async summarizeEmail(email: EmailRecord): Promise<EmailSummary> {
    if (!this.isConfigured()) {
      return {
        summary: email.snippet || 'No summary available',
        keyPoints: [],
        actionItems: [],
        sentiment: 'neutral'
      };
    }

    try {
      const prompt = `
        Summarize this email concisely.

        From: ${email.sender_name || email.sender_email}
        Subject: ${email.subject}
        Body: ${email.body_text || email.snippet}

        Provide:
        1. A 1-2 sentence summary
        2. Key points (bullet list)
        3. Action items if any
        4. Overall sentiment (positive/negative/neutral/mixed)

        Respond in JSON format.
      `;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const parsed = JSON.parse(content.text);
          return {
            summary: parsed.summary || email.snippet || '',
            keyPoints: parsed.keyPoints || [],
            actionItems: parsed.actionItems || [],
            sentiment: parsed.sentiment || 'neutral'
          };
        } catch {
          return {
            summary: content.text.substring(0, 200),
            keyPoints: [],
            actionItems: [],
            sentiment: 'neutral'
          };
        }
      }
    } catch (error) {
      console.error('Error summarizing email:', error);
    }

    return {
      summary: email.snippet || 'Summary unavailable',
      keyPoints: [],
      actionItems: [],
      sentiment: 'neutral'
    };
  }

  async analyzeSearchQuery(query: string): Promise<{
    enhancedQuery: string;
    filters: {
      dateRange?: { start: Date; end: Date };
      senders?: string[];
      hasAttachment?: boolean;
      isImportant?: boolean;
      category?: string;
    };
  }> {
    if (!this.isConfigured()) {
      return {
        enhancedQuery: query,
        filters: {}
      };
    }

    try {
      const prompt = `
        Analyze this email search query and extract structured search parameters.

        Query: "${query}"

        Extract:
        1. Enhanced search terms (keywords to search for)
        2. Date ranges if mentioned (e.g., "last week", "yesterday")
        3. Specific senders if mentioned
        4. Other filters (attachments, importance, categories)

        Current date: ${new Date().toISOString()}

        Respond in JSON format with enhancedQuery and filters object.
      `;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const parsed = JSON.parse(content.text);
          return {
            enhancedQuery: parsed.enhancedQuery || query,
            filters: parsed.filters || {}
          };
        } catch {
          return {
            enhancedQuery: query,
            filters: {}
          };
        }
      }
    } catch (error) {
      console.error('Error analyzing search query:', error);
    }

    return {
      enhancedQuery: query,
      filters: {}
    };
  }

  async profileSender(emails: EmailRecord[]): Promise<SenderProfile | null> {
    if (!this.isConfigured() || emails.length === 0) {
      return null;
    }

    const senderEmail = emails[0].sender_email;
    const senderName = emails[0].sender_name;

    try {
      const emailSummaries = emails.slice(0, 10).map(e => ({
        subject: e.subject,
        date: e.date,
        snippet: e.snippet
      }));

      const prompt = `
        Analyze these emails from the same sender to build a communication profile.

        Sender: ${senderName || senderEmail}
        Email: ${senderEmail}

        Recent emails:
        ${JSON.stringify(emailSummaries, null, 2)}

        Provide:
        1. Relationship type (colleague, client, friend, newsletter, etc.)
        2. Communication style (formal, casual, technical, etc.)
        3. Typical topics they discuss
        4. Expected response time based on patterns

        Respond in JSON format.
      `;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const parsed = JSON.parse(content.text);
          return {
            email: senderEmail,
            name: senderName,
            relationship: parsed.relationship || 'Unknown',
            communicationStyle: parsed.communicationStyle || 'Standard',
            typicalTopics: parsed.typicalTopics || [],
            responseTimeExpectation: parsed.responseTimeExpectation || 'Normal'
          };
        } catch {
          return null;
        }
      }
    } catch (error) {
      console.error('Error profiling sender:', error);
    }

    return null;
  }

  async suggestQuickReplies(email: EmailRecord): Promise<string[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const prompt = `
        Generate 3-5 short quick reply options for this email.

        Subject: ${email.subject}
        Body: ${email.body_text?.substring(0, 500) || email.snippet}

        Create brief, one-line responses that could be appropriate.
        Examples: "Thanks, I'll review this", "Sounds good!", "Let me check and get back to you"

        Respond with a JSON array of strings.
      `;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const parsed = JSON.parse(content.text);
          return Array.isArray(parsed) ? parsed : parsed.replies || [];
        } catch {
          return [];
        }
      }
    } catch (error) {
      console.error('Error generating quick replies:', error);
    }

    return [];
  }
}

export default AIManager;
export type { EmailPriority, DraftSuggestion, EmailSummary, SenderProfile };