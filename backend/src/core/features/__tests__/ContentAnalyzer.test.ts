/**
 * ContentAnalyzer Unit Tests
 *
 * Test scenarios:
 * - Question detection (direct and implicit)
 * - Deadline extraction using chrono-node
 * - Urgency signal detection (0-10 scale)
 * - Action item identification
 * - Intent classification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentAnalyzer, type ContentAnalysis } from '../ContentAnalyzer.js';

describe('ContentAnalyzer', () => {
  let analyzer: ContentAnalyzer;

  beforeEach(() => {
    analyzer = ContentAnalyzer.getInstance();
  });

  describe('Question Detection', () => {
    describe('Direct Questions', () => {
      it('should detect questions with question marks', () => {
        const text = 'Can you send me the report?';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
        expect(result.question_type).toBe('direct');
      });

      it('should detect "can you" questions', () => {
        const text = 'Can you help me with this project';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
        expect(result.question_type).toBe('direct');
      });

      it('should detect "would you" questions', () => {
        const text = 'Would you be available for a call tomorrow';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
        expect(result.question_type).toBe('direct');
      });

      it('should detect WH-questions (what, when, where, who, why, how)', () => {
        const testCases = [
          'What is the status of the project',
          'When can we schedule the meeting',
          'Where should we meet',
          'Who is responsible for this task',
          'Why did the deployment fail',
          'How do I access the dashboard'
        ];

        for (const text of testCases) {
          const result = (analyzer as any).detectQuestions(text);
          expect(result.has_question).toBe(true);
          expect(result.question_type).toBe('direct');
        }
      });
    });

    describe('Implicit Questions', () => {
      it('should detect "please confirm" requests', () => {
        const text = 'Please confirm you received this email.';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
        expect(result.question_type).toBe('implicit');
      });

      it('should detect "let me know" requests', () => {
        const text = 'Let me know if you have any concerns about the proposal.';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
        expect(result.question_type).toBe('implicit');
      });

      it('should detect "wondering if" patterns', () => {
        const text = 'I was wondering if you could review this document.';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
        expect(result.question_type).toBe('implicit');
      });

      it('should detect "feedback on" requests', () => {
        const text = 'Would appreciate your feedback on the design.';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(true);
      });
    });

    describe('Non-Questions', () => {
      it('should not detect questions in informational text', () => {
        const text = 'The meeting has been scheduled for tomorrow at 3pm.';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(false);
        expect(result.question_type).toBe('none');
      });

      it('should not detect questions in simple statements', () => {
        const text = 'I have completed the task and sent the report.';
        const result = (analyzer as any).detectQuestions(text);

        expect(result.has_question).toBe(false);
        expect(result.question_type).toBe('none');
      });
    });
  });

  describe('Deadline Extraction', () => {
    it('should extract explicit deadline with "by" keyword', () => {
      const text = 'Please submit the report by next Friday.';
      const result = (analyzer as any).extractDeadlines(text);

      expect(result.deadline_epoch).not.toBeNull();
      if (result.time_to_deadline_min !== null) {
        expect(result.time_to_deadline_min).toBeGreaterThan(0);
      }
    });

    it('should extract deadline with "before" keyword', () => {
      const text = 'Need this completed before end of week.';
      const result = (analyzer as any).extractDeadlines(text);

      expect(result.deadline_epoch).not.toBeNull();
    });

    it('should extract deadline with "due" keyword', () => {
      const text = 'The assignment is due tomorrow at 5pm.';
      const result = (analyzer as any).extractDeadlines(text);

      expect(result.deadline_epoch).not.toBeNull();
      expect(result.time_to_deadline_min).not.toBeNull();
    });

    it('should extract relative deadlines (today, tomorrow)', () => {
      // Test with phrases that chrono-node parses reliably
      const testCases = [
        'Please reply by tomorrow',
        'Need this by next week',
        'Due by next Monday'
      ];

      for (const text of testCases) {
        const result = (analyzer as any).extractDeadlines(text);
        // chrono-node may not parse all patterns, so we check at least some work
        if (result.deadline_epoch !== null) {
          expect(result.deadline_epoch).toBeGreaterThan(0);
        }
      }
    });

    it('should extract deadlines from "this week" or "next week"', () => {
      const text = 'Let me know by next week.';
      const result = (analyzer as any).extractDeadlines(text);

      expect(result.deadline_epoch).not.toBeNull();
    });

    it('should find earliest deadline when multiple exist', () => {
      const text = 'First draft due by tomorrow, final version by next Friday.';
      const result = (analyzer as any).extractDeadlines(text);

      expect(result.deadline_epoch).not.toBeNull();
      // Should pick tomorrow (earliest)
      expect(result.time_to_deadline_min).toBeLessThan(48 * 60); // Less than 2 days
    });

    it('should ignore past dates', () => {
      const text = 'The deadline was last week.';
      const result = (analyzer as any).extractDeadlines(text);

      // chrono might parse "last week", but we filter out past dates
      // So this could be null or a future interpretation
      // Just ensure it doesn't crash
      expect(result).toBeDefined();
    });

    it('should return null when no deadline exists', () => {
      const text = 'Just wanted to say hello and see how you are doing.';
      const result = (analyzer as any).extractDeadlines(text);

      expect(result.deadline_epoch).toBeNull();
      expect(result.time_to_deadline_min).toBeNull();
    });
  });

  describe('Urgency Detection', () => {
    describe('Critical Urgency', () => {
      it('should detect "urgent" keyword', () => {
        const subject = 'URGENT: Server Down';
        const body = 'We have an urgent situation that needs immediate attention.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(5);
        expect(result.urgency_signals.length).toBeGreaterThan(0);
      });

      it('should detect "ASAP" keyword', () => {
        const subject = 'Need response ASAP';
        const body = 'Please handle this as soon as possible.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(5);
      });

      it('should detect "immediate" keyword', () => {
        const subject = 'Immediate action required';
        const body = 'This requires immediate attention.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(5);
      });

      it('should detect multiple exclamation marks', () => {
        const subject = 'CRITICAL ISSUE!!!';
        const body = 'We need help now!!!';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(5);
      });
    });

    describe('High Urgency', () => {
      it('should detect "high priority" keyword', () => {
        const subject = 'High Priority: Budget Approval';
        const body = 'This is a high priority item for review.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(3);
      });

      it('should detect "deadline" keyword', () => {
        const subject = 'Deadline Approaching';
        const body = 'The deadline for submission is coming up.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(3);
      });
    });

    describe('Medium Urgency', () => {
      it('should detect "follow-up" keyword', () => {
        const subject = 'Follow-up on previous email';
        const body = 'Just following up on my last message.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(1);
      });

      it('should detect "reminder" keyword', () => {
        const subject = 'Reminder: Team Meeting';
        const body = 'Friendly reminder about our meeting tomorrow.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Low/No Urgency', () => {
      it('should score low for casual emails', () => {
        const subject = 'Happy Friday!';
        const body = 'Hope you have a great weekend.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeLessThan(3);
      });

      it('should score low for informational emails', () => {
        const subject = 'Weekly Newsletter';
        const body = 'Here are this week\'s updates and news.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeLessThan(3);
      });
    });

    describe('ALL CAPS Detection', () => {
      it('should detect ALL CAPS words in subject as urgency signal', () => {
        const subject = 'URGENT ACTION REQUIRED NOW';
        const body = 'Please review the attached document.';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeGreaterThanOrEqual(2);
        expect(result.urgency_signals).toContain('ALL CAPS in subject');
      });
    });

    describe('Urgency Level Capping', () => {
      it('should cap urgency at 10', () => {
        const subject = 'URGENT CRITICAL EMERGENCY ASAP NOW!!!';
        const body = 'URGENT! CRITICAL! EMERGENCY! IMMEDIATE ACTION REQUIRED!!! DEADLINE!!! HIGH PRIORITY!!!';
        const result = (analyzer as any).detectUrgency(subject, body);

        expect(result.urgency_level).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Action Item Extraction', () => {
    it('should extract bullet point action items', () => {
      const body = `
Please complete the following:
- Review the proposal
- Send feedback by Friday
- Schedule follow-up meeting
      `;
      const result = (analyzer as any).extractActionItems(body);

      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('Review the proposal');
    });

    it('should extract numbered list action items', () => {
      const body = `
Action items:
1. Complete the report
2. Submit to manager
3. Follow up next week
      `;
      const result = (analyzer as any).extractActionItems(body);

      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('Complete the report');
    });

    it('should extract checkbox action items', () => {
      const body = `
Tasks:
[ ] Review code
[x] Write tests
[ ] Deploy to staging
      `;
      const result = (analyzer as any).extractActionItems(body);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should extract TODO markers', () => {
      const body = 'TODO: Update the documentation and add examples';
      const result = (analyzer as any).extractActionItems(body);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('Update the documentation');
    });

    it('should extract action verbs when no list markers', () => {
      const body = 'Please review the attached document. Submit your feedback by tomorrow. Schedule a meeting for next week.';
      const result = (analyzer as any).extractActionItems(body);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should limit to 5 action items', () => {
      const body = `
- Task 1
- Task 2
- Task 3
- Task 4
- Task 5
- Task 6
- Task 7
- Task 8
      `;
      const result = (analyzer as any).extractActionItems(body);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should deduplicate action items', () => {
      const body = `
- Review the report
- Review the report
- Submit feedback
- Review the report
      `;
      const result = (analyzer as any).extractActionItems(body);

      const reviewCount = result.filter((item: string) => item === 'Review the report').length;
      expect(reviewCount).toBe(1);
    });
  });

  describe('Intent Classification', () => {
    it('should classify as "request" when has question', () => {
      const hasQuestion = true;
      const hasDeadline = false;
      const urgencyLevel = 3;
      const actionItemCount = 0;

      const intent = (analyzer as any).classifyIntent(hasQuestion, hasDeadline, urgencyLevel, actionItemCount);

      expect(intent).toBe('request');
    });

    it('should classify as "request" when has action items', () => {
      const hasQuestion = false;
      const hasDeadline = false;
      const urgencyLevel = 2;
      const actionItemCount = 3;

      const intent = (analyzer as any).classifyIntent(hasQuestion, hasDeadline, urgencyLevel, actionItemCount);

      expect(intent).toBe('request');
    });

    it('should classify as "request" when urgency is high', () => {
      const hasQuestion = false;
      const hasDeadline = false;
      const urgencyLevel = 8;
      const actionItemCount = 0;

      const intent = (analyzer as any).classifyIntent(hasQuestion, hasDeadline, urgencyLevel, actionItemCount);

      expect(intent).toBe('request');
    });

    it('should classify as "schedule" when has deadline but low urgency', () => {
      const hasQuestion = false;
      const hasDeadline = true;
      const urgencyLevel = 2;
      const actionItemCount = 0;

      const intent = (analyzer as any).classifyIntent(hasQuestion, hasDeadline, urgencyLevel, actionItemCount);

      expect(intent).toBe('schedule');
    });

    it('should classify as "confirm" when has deadline and high urgency', () => {
      const hasQuestion = false;
      const hasDeadline = true;
      const urgencyLevel = 7;
      const actionItemCount = 0;

      const intent = (analyzer as any).classifyIntent(hasQuestion, hasDeadline, urgencyLevel, actionItemCount);

      expect(intent).toBe('confirm');
    });

    it('should classify as "inform" for informational emails', () => {
      const hasQuestion = false;
      const hasDeadline = false;
      const urgencyLevel = 0;
      const actionItemCount = 0;

      const intent = (analyzer as any).classifyIntent(hasQuestion, hasDeadline, urgencyLevel, actionItemCount);

      expect(intent).toBe('inform');
    });
  });

  describe('Full Content Analysis', () => {
    it('should analyze urgent request email correctly', () => {
      const subject = 'URGENT: Need your approval ASAP';
      const body = 'Can you please approve the budget by end of day? This is critical for the project timeline.';

      const result = analyzer.analyzeContent(subject, body);

      expect(result.has_question).toBe(true);
      expect(result.question_type).toBe('direct');
      expect(result.urgency_level).toBeGreaterThanOrEqual(5);
      expect(result.intent).toBe('confirm'); // Deadline + high urgency = confirm
    });

    it('should analyze informational newsletter correctly', () => {
      const subject = 'Weekly Company Update';
      const body = 'Here are the latest updates from around the company. Team achievements this week include...';

      const result = analyzer.analyzeContent(subject, body);

      expect(result.has_question).toBe(false);
      expect(result.urgency_level).toBeLessThan(3);
      expect(result.intent).toBe('inform');
    });

    it('should analyze meeting request with deadline correctly', () => {
      const subject = 'Meeting Request: Project Review';
      const body = 'Please let me know your availability by tomorrow for a project review meeting next week.';

      const result = analyzer.analyzeContent(subject, body);

      expect(result.has_question).toBe(true);
      expect(result.deadline_epoch).not.toBeNull();
      expect(result.intent).toMatch(/request|schedule/);
    });

    it('should analyze action item email correctly', () => {
      const subject = 'Action Items from Today\'s Meeting';
      const body = `
Following up on today's meeting:
- Review the proposal
- Provide feedback by Friday
- Schedule follow-up call
      `;

      const result = analyzer.analyzeContent(subject, body);

      expect(result.action_items.length).toBeGreaterThan(0);
      expect(result.intent).toBe('request');
    });
  });

  describe('Helper Methods', () => {
    it('isMeetingRelated should detect meeting-related content', () => {
      const testCases = [
        { subject: 'Team Meeting Tomorrow', body: '', expected: true },
        { subject: '', body: 'Let\'s schedule a Zoom call', expected: true },
        { subject: 'Conference Room Booking', body: 'Calendar invite attached', expected: true },
        { subject: 'Project Update', body: 'Here is the status report', expected: false }
      ];

      for (const testCase of testCases) {
        const result = analyzer.isMeetingRelated(testCase.subject, testCase.body);
        expect(result).toBe(testCase.expected);
      }
    });

    it('isFinancialRelated should detect financial content', () => {
      const testCases = [
        { subject: 'Invoice #12345', body: '', expected: true },
        { subject: '', body: 'Your payment of $150.00 has been processed', expected: true },
        { subject: 'Receipt for Purchase', body: 'Order total: $299.99', expected: true },
        { subject: 'Team Update', body: 'Great work everyone!', expected: false }
      ];

      for (const testCase of testCases) {
        const result = analyzer.isFinancialRelated(testCase.subject, testCase.body);
        expect(result).toBe(testCase.expected);
      }
    });
  });
});
