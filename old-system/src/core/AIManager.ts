import Anthropic from '@anthropic-ai/sdk';
import { EmailRecord } from '../database.js';

interface EmailPriority {
  score: number; // 0-100
  reason: string;
  category: 'urgent' | 'important' | 'normal' | 'low' | 'spam';
  suggestedAction?: string;
}

interface DraftSuggestion {
  subject?: string;
  body: string;
  tone: 'formal' | 'casual' | 'friendly' | 'professional';
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

  static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // Heuristic-based prioritization for when AI is not available
  private heuristicPrioritize(email: EmailRecord): EmailPriority {
    let score = 50; // Base score
    let category: 'urgent' | 'important' | 'normal' | 'low' | 'spam' = 'normal';
    const reasons: string[] = [];

    const subject = email.subject.toLowerCase();
    const body = (email.body_text || email.snippet || '').toLowerCase();
    const sender = email.sender_email.toLowerCase();

    // Check for urgent keywords
    const urgentKeywords = ['urgent', 'asap', 'immediate', 'critical', 'emergency', 'deadline', 'important'];
    const hasUrgentKeyword = urgentKeywords.some(kw => subject.includes(kw) || body.includes(kw));
    if (hasUrgentKeyword) {
      score += 30;
      reasons.push('Contains urgent keywords');
    }

    // Check for action required
    const actionKeywords = ['action required', 'please review', 'approval needed', 'response needed', 'waiting for'];
    const hasActionKeyword = actionKeywords.some(kw => subject.includes(kw) || body.includes(kw));
    if (hasActionKeyword) {
      score += 20;
      reasons.push('Action required');
    }

    // Check for meeting/calendar
    const meetingKeywords = ['meeting', 'calendar', 'invitation', 'schedule', 'appointment'];
    const hasMeetingKeyword = meetingKeywords.some(kw => subject.includes(kw));
    if (hasMeetingKeyword) {
      score += 15;
      reasons.push('Meeting related');
    }

    // Check if from important domains
    const importantDomains = ['google.com', 'microsoft.com', 'apple.com', 'amazon.com'];
    if (importantDomains.some(domain => sender.includes(domain))) {
      score += 10;
      reasons.push('From important service');
    }

    // Check for newsletters/marketing
    const marketingKeywords = ['unsubscribe', 'newsletter', 'promotional', 'deal', 'offer', 'sale'];
    const isMarketing = marketingKeywords.some(kw => body.includes(kw));
    if (isMarketing) {
      score -= 20;
      reasons.push('Marketing/Newsletter');
    }

    // Check if it's a notification
    if (sender.includes('noreply') || sender.includes('no-reply') || sender.includes('notification')) {
      score -= 10;
      reasons.push('Automated notification');
    }

    // Determine category based on final score
    if (score >= 90) category = 'urgent';
    else if (score >= 70) category = 'important';
    else if (score >= 50) category = 'normal';
    else if (score >= 30) category = 'low';
    else category = 'spam';

    // Cap score between 0-100
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      category,
      reason: reasons.join(', ') || 'Standard email',
      suggestedAction: score >= 70 ? 'Reply within 24 hours' : undefined
    };
  }

  async prioritizeEmail(email: EmailRecord): Promise<EmailPriority> {
    // Quick heuristic-based prioritization when AI not configured
    if (!this.isConfigured()) {
      return this.heuristicPrioritize(email);
    }

    try {
      const prompt = `
        Analyze this email and provide a priority score (0-100) and categorization.

        From: ${email.sender_name || email.sender_email}
        Subject: ${email.subject}
        Date: ${email.date}
        Body: ${email.body_text?.substring(0, 1000) || email.snippet}

        Provide:
        1. Priority score (0-100, where 100 is most urgent)
        2. Category: urgent, important, normal, low, or spam
        3. Brief reason for the priority
        4. Suggested action if applicable

        Consider:
        - Time-sensitive language
        - Sender importance
        - Action requirements
        - Business impact

        Respond in JSON format.
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
        temperature: 0.3
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const parsed = JSON.parse(content.text);
          return {
            score: parsed.score || 50,
            reason: parsed.reason || 'Standard email',
            category: parsed.category || 'normal',
            suggestedAction: parsed.suggestedAction
          };
        } catch {
          // Fallback parsing
          return {
            score: 50,
            reason: 'Unable to parse priority',
            category: 'normal'
          };
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
    context?: string
  ): Promise<DraftSuggestion[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const prompt = `
        Generate 3 different email ${mode} suggestions for this email.

        Original Email:
        From: ${originalEmail.sender_name || originalEmail.sender_email}
        Subject: ${originalEmail.subject}
        Date: ${originalEmail.date}
        Body: ${originalEmail.body_text?.substring(0, 1500) || originalEmail.snippet}

        ${context ? `Additional context: ${context}` : ''}

        Create 3 variations:
        1. Professional/Formal tone
        2. Friendly/Casual tone
        3. Brief/Concise response

        Each should:
        - Be appropriate for the context
        - Address key points from the original email
        - Be complete and ready to send
        - Match the appropriate tone

        Respond in JSON format with an array of suggestions, each with: body, tone, confidence (0-1).
      `;

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