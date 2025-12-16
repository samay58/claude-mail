/**
 * ContentAnalyzer - Deep content analysis for intent and urgency
 *
 * Features:
 * - Question detection (direct and implicit)
 * - Deadline extraction using chrono-node
 * - Urgency signal detection
 * - Action item identification
 * - Intent classification
 */

import * as chrono from 'chrono-node';

export interface ContentAnalysis {
  has_question: boolean;
  question_type: 'direct' | 'implicit' | 'none';
  deadline_epoch: number | null;
  time_to_deadline_min: number | null;
  urgency_level: number;  // 0-10
  urgency_signals: string[];
  action_items: string[];
  intent: 'request' | 'inform' | 'schedule' | 'confirm' | null;
}

export class ContentAnalyzer {
  private static instance: ContentAnalyzer;

  /**
   * Direct question patterns
   */
  private static readonly DIRECT_QUESTION_PATTERNS = [
    /\?$/m,  // Ends with question mark
    /\?\s/,  // Question mark followed by space
    /can you/i,
    /could you/i,
    /would you/i,
    /will you/i,
    /do you/i,
    /did you/i,
    /have you/i,
    /are you/i,
    /is it possible/i,
    /what('s| is)/i,
    /when('s| is)/i,
    /where('s| is)/i,
    /who('s| is)/i,
    /why('s| is)/i,
    /how('s| is)/i
  ];

  /**
   * Implicit question patterns (no question mark but requesting action)
   */
  private static readonly IMPLICIT_QUESTION_PATTERNS = [
    /please (advise|confirm|reply|respond|review|approve|let me know)/i,
    /kindly (advise|confirm|reply|respond|review|approve)/i,
    /i('d| would) (like|appreciate|love) (to know|if you could|your input)/i,
    /wondering if/i,
    /let me know/i,
    /tell me/i,
    /share (your|the)/i,
    /thoughts on/i,
    /feedback on/i,
    /input on/i,
    /clarify/i
  ];

  /**
   * Deadline keywords and patterns
   */
  private static readonly DEADLINE_PATTERNS = [
    /(?:by|before|until|due|deadline)\s+(.+?)(?:\.|,|;|$)/i,
    /(?:by|before) (?:end of |EOD |eod |close of business|COB)/i,
    /(?:by|before) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /(?:by|before) (?:today|tomorrow|this week|next week|this month)/i,
    /(?:by|before) \d{1,2}(?:st|nd|rd|th)?/i,
    /expires?\s+(.+?)(?:\.|,|;|$)/i,
    /valid\s+(?:until|through)\s+(.+?)(?:\.|,|;|$)/i
  ];

  /**
   * Urgency signal keywords
   */
  private static readonly URGENCY_SIGNALS = {
    CRITICAL: [
      /\b(urgent|emergency|critical|immediate(?:ly)?|asap|right away)\b/i,
      /\b(time[- ]sensitive|time critical|priority)\b/i,
      /\b(action required|response required|approval required)\b/i,
      /!!!+/,  // Multiple exclamation marks
      /\bNOW\b/  // All caps NOW
    ],
    HIGH: [
      /\b(soon|quickly|prompt(?:ly)?|expedite)\b/i,
      /\b(high priority|important)\b/i,
      /\b(need(?:ed)? (?:by|before))\b/i,
      /\b(deadline|due date)\b/i
    ],
    MEDIUM: [
      /\b(timely|at your earliest convenience)\b/i,
      /\b(follow[- ]?up|reminder)\b/i,
      /\b(pending|waiting for)\b/i
    ]
  };

  /**
   * Action verb patterns
   */
  private static readonly ACTION_PATTERNS = [
    /\b(review|approve|sign|submit|respond|reply|confirm|acknowledge)\b/i,
    /\b(complete|finish|provide|send|forward|share)\b/i,
    /\b(update|verify|check|validate|test)\b/i,
    /\b(schedule|book|arrange|coordinate|plan)\b/i,
    /\b(prepare|create|draft|write|compose)\b/i,
    /\b(read|examine|look at|go through|assess)\b/i
  ];

  /**
   * Action item markers (lists, checkboxes)
   */
  private static readonly ACTION_MARKERS = [
    /^[\s]*[-*•]\s+(.+)$/gm,      // Bullet points
    /^[\s]*\d+\.\s+(.+)$/gm,       // Numbered lists
    /^[\s]*\[[ x]\]\s+(.+)$/gim,   // Checkboxes
    /^[\s]*☐\s+(.+)$/gm,           // Unicode checkbox
    /^[\s]*TODO:\s+(.+)$/gim       // TODO markers
  ];

  private constructor() {}

  static getInstance(): ContentAnalyzer {
    if (!ContentAnalyzer.instance) {
      ContentAnalyzer.instance = new ContentAnalyzer();
    }
    return ContentAnalyzer.instance;
  }

  /**
   * Main analysis method - analyzes email content
   */
  analyzeContent(subject: string, bodyText: string): ContentAnalysis {
    const fullText = `${subject}\n${bodyText}`;

    // 1. Detect questions
    const questionResult = this.detectQuestions(fullText);

    // 2. Extract deadlines
    const deadlineResult = this.extractDeadlines(fullText);

    // 3. Detect urgency
    const urgencyResult = this.detectUrgency(subject, bodyText);

    // 4. Extract action items
    const actionItems = this.extractActionItems(bodyText);

    // 5. Classify intent
    const intent = this.classifyIntent(
      questionResult.has_question,
      deadlineResult.deadline_epoch !== null,
      urgencyResult.urgency_level,
      actionItems.length
    );

    return {
      has_question: questionResult.has_question,
      question_type: questionResult.question_type,
      deadline_epoch: deadlineResult.deadline_epoch,
      time_to_deadline_min: deadlineResult.time_to_deadline_min,
      urgency_level: urgencyResult.urgency_level,
      urgency_signals: urgencyResult.urgency_signals,
      action_items: actionItems,
      intent
    };
  }

  /**
   * Detect questions (direct and implicit)
   */
  private detectQuestions(text: string): {
    has_question: boolean;
    question_type: 'direct' | 'implicit' | 'none';
  } {
    // Check for direct questions
    for (const pattern of ContentAnalyzer.DIRECT_QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        return { has_question: true, question_type: 'direct' };
      }
    }

    // Check for WH-questions at sentence start (even without ?)
    const whWordAtStart = /^(what|when|where|who|why|how)\s+/im;
    if (whWordAtStart.test(text)) {
      return { has_question: true, question_type: 'direct' };
    }

    // Check for implicit questions
    for (const pattern of ContentAnalyzer.IMPLICIT_QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        return { has_question: true, question_type: 'implicit' };
      }
    }

    return { has_question: false, question_type: 'none' };
  }

  /**
   * Extract deadlines using chrono-node
   */
  private extractDeadlines(text: string): {
    deadline_epoch: number | null;
    time_to_deadline_min: number | null;
  } {
    const now = new Date();
    let earliestDeadline: Date | null = null;

    // Pre-process common phrases for better chrono-node parsing
    let processedText = text;
    processedText = processedText.replace(/\b(by|before)\s+today\b/gi, 'today');
    processedText = processedText.replace(/\b(by|before)\s+tomorrow\b/gi, 'tomorrow');
    processedText = processedText.replace(/\b(end of|close of)\s+week\b/gi, 'Friday');
    processedText = processedText.replace(/\b(end of|close of)\s+day\b/gi, 'today 5pm');
    processedText = processedText.replace(/\bEOD\b/gi, 'today 5pm');
    processedText = processedText.replace(/\bCOB\b/gi, 'today 5pm');

    // Try to find deadline patterns
    for (const pattern of ContentAnalyzer.DEADLINE_PATTERNS) {
      const match = processedText.match(pattern);
      if (match) {
        // Extract the date portion
        const dateText = match[1] || match[0];

        // Use chrono to parse the date
        const parsed = chrono.parseDate(dateText, now);

        if (parsed) {
          // Keep track of earliest deadline
          if (!earliestDeadline || parsed < earliestDeadline) {
            earliestDeadline = parsed;
          }
        }
      }
    }

    // Also try general chrono parsing on the processed text (limited to first 500 chars)
    const textSnippet = processedText.substring(0, 500);
    const generalParsed = chrono.parse(textSnippet, now);

    for (const result of generalParsed) {
      const parsedDate = result.start.date();

      // Only consider future dates as deadlines
      if (parsedDate > now) {
        if (!earliestDeadline || parsedDate < earliestDeadline) {
          earliestDeadline = parsedDate;
        }
      }
    }

    if (!earliestDeadline) {
      return { deadline_epoch: null, time_to_deadline_min: null };
    }

    const deadlineEpoch = Math.floor(earliestDeadline.getTime() / 1000);
    const timeToDeadlineMs = earliestDeadline.getTime() - now.getTime();
    const timeToDeadlineMin = Math.floor(timeToDeadlineMs / (1000 * 60));

    return {
      deadline_epoch: deadlineEpoch,
      time_to_deadline_min: timeToDeadlineMin > 0 ? timeToDeadlineMin : null
    };
  }

  /**
   * Detect urgency signals (0-10 scale)
   */
  private detectUrgency(subject: string, bodyText: string): {
    urgency_level: number;
    urgency_signals: string[];
  } {
    const signals: string[] = [];
    let score = 0;

    const fullText = `${subject}\n${bodyText}`;

    // Check CRITICAL signals (add 5 points each)
    for (const pattern of ContentAnalyzer.URGENCY_SIGNALS.CRITICAL) {
      if (pattern.test(fullText)) {
        score += 5;
        signals.push(pattern.source);
      }
    }

    // Check HIGH signals (add 3 points each)
    for (const pattern of ContentAnalyzer.URGENCY_SIGNALS.HIGH) {
      if (pattern.test(fullText)) {
        score += 3;
        signals.push(pattern.source);
      }
    }

    // Check MEDIUM signals (add 1 point each)
    for (const pattern of ContentAnalyzer.URGENCY_SIGNALS.MEDIUM) {
      if (pattern.test(fullText)) {
        score += 1;
        signals.push(pattern.source);
      }
    }

    // Check for all caps words in subject (urgency signal)
    const allCapsWords = subject.match(/\b[A-Z]{3,}\b/g);
    if (allCapsWords && allCapsWords.length > 0) {
      score += 2;
      signals.push('ALL CAPS in subject');
    }

    // Cap at 10
    const urgencyLevel = Math.min(10, score);

    return {
      urgency_level: urgencyLevel,
      urgency_signals: signals
    };
  }

  /**
   * Extract action items from text
   */
  private extractActionItems(bodyText: string): string[] {
    const items: string[] = [];

    // Extract from list markers
    for (const pattern of ContentAnalyzer.ACTION_MARKERS) {
      const matches = bodyText.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          items.push(match[1].trim());
        }
      }
    }

    // If no list markers, look for action verbs in sentences
    if (items.length === 0) {
      const sentences = bodyText.split(/[.!?]\s+/);

      for (const sentence of sentences) {
        for (const pattern of ContentAnalyzer.ACTION_PATTERNS) {
          if (pattern.test(sentence)) {
            items.push(sentence.trim());
            break; // One action item per sentence
          }
        }

        // Limit to first 5 action items
        if (items.length >= 5) break;
      }
    }

    // Deduplicate and limit to first 5
    const unique = [...new Set(items)];
    return unique.slice(0, 5);
  }

  /**
   * Classify intent based on analysis
   */
  private classifyIntent(
    hasQuestion: boolean,
    hasDeadline: boolean,
    urgencyLevel: number,
    actionItemCount: number
  ): 'request' | 'inform' | 'schedule' | 'confirm' | null {
    // Confirm: deadline + high urgency (needs confirmation) - Check this FIRST
    if (hasDeadline && urgencyLevel >= 5) {
      return 'confirm';
    }

    // Request: has question or action items or high urgency without deadline
    if (hasQuestion || actionItemCount > 0 || urgencyLevel >= 5) {
      return 'request';
    }

    // Schedule: has deadline but not super urgent
    if (hasDeadline && urgencyLevel < 5) {
      return 'schedule';
    }

    // Inform: no questions, no deadlines, no urgency
    return 'inform';
  }

  /**
   * Helper: Check if email is a meeting/calendar related
   */
  isMeetingRelated(subject: string, bodyText: string): boolean {
    const meetingPatterns = [
      /\b(meeting|calendar|invite|invitation|scheduled|appointment)\b/i,
      /\b(zoom|teams|meet|webex|gotomeeting)\b/i,
      /\b(join|dial[- ]?in|conference|call)\b/i
    ];

    const fullText = `${subject}\n${bodyText}`;

    return meetingPatterns.some(pattern => pattern.test(fullText));
  }

  /**
   * Helper: Check if email contains financial/payment info
   */
  isFinancialRelated(subject: string, bodyText: string): boolean {
    const financialPatterns = [
      /\b(invoice|payment|receipt|billing|charge|transaction)\b/i,
      /\b(refund|credit|debit|purchase|order)\b/i,
      /\$\d+/,  // Dollar amounts
      /\d+\.\d{2}/  // Decimal amounts
    ];

    const fullText = `${subject}\n${bodyText}`;

    return financialPatterns.some(pattern => pattern.test(fullText));
  }
}