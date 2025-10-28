/**
 * PriorityScorer Tests
 *
 * Test the final scoring layer that combines all features
 * into a priority score (0-100) with proper categorization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityScorer, type PriorityScore } from '../PriorityScorer.js';
import type { MessageFeatures } from '../FeatureExtractor.js';

describe('PriorityScorer', () => {
  let scorer: PriorityScorer;

  beforeEach(() => {
    scorer = PriorityScorer.getInstance();
  });

  /**
   * Helper: Create baseline message features
   */
  const createBaselineFeatures = (emailId: string = 'test-001'): MessageFeatures => ({
    email_id: emailId,

    // Deterministic gates
    is_newsletter: 0,
    is_auto_generated: 0,
    has_list_unsubscribe: 0,
    has_list_id: 0,
    has_auto_submitted: 0,
    has_calendar: 0,
    calendar_start_epoch: null,
    otp_detected: 0,
    otp_age_minutes: null,

    // Relationship features
    relationship_score: 0,  // No relationship (truly neutral)
    is_vip_sender: 0,
    reply_count_from_user: 0,
    reply_count_to_user: 0,
    last_interaction_epoch: null,

    // Thread context
    thread_you_owe: 0,
    thread_recency_minutes: null,
    thread_length: 1,

    // Content intent
    explicit_ask: 0,
    deadline_epoch: null,
    time_to_deadline_min: null,
    content_intent: null,

    // Reply prediction
    reply_need_prob: 0,  // No reply needed
    reply_latency_bucket: 3
  });

  describe('Baseline Scoring', () => {
    it('should score neutral email at baseline (50)', () => {
      const features = createBaselineFeatures();
      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(40);
      expect(score.score).toBeLessThanOrEqual(60);
      expect(score.category).toBe('normal');
      expect(score.email_id).toBe('test-001');
    });

    it('should have confidence between 0 and 1', () => {
      const features = createBaselineFeatures();
      const score = scorer.calculatePriority(features);

      expect(score.confidence).toBeGreaterThanOrEqual(0);
      expect(score.confidence).toBeLessThanOrEqual(1);
    });

    it('should provide reasoning array', () => {
      const features = createBaselineFeatures();
      const score = scorer.calculatePriority(features);

      expect(Array.isArray(score.reasoning)).toBe(true);
      expect(score.feature_weights).toBeDefined();
    });
  });

  describe('Negative Signals', () => {
    it('should heavily penalize newsletters (-30 points)', () => {
      const features = createBaselineFeatures();
      features.is_newsletter = 1;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeLessThan(30);
      expect(score.category).toBe('spam');
      expect(score.reasoning).toContain('Newsletter detected (RFC 2369/2919)');
    });

    it('should penalize auto-generated emails (-20 points)', () => {
      const features = createBaselineFeatures();
      features.is_auto_generated = 1;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeLessThan(50);
      expect(score.reasoning).toContain('Auto-generated email (RFC 3834)');
    });

    it('should NOT penalize calendar invites even if auto-generated', () => {
      const features = createBaselineFeatures();
      features.is_auto_generated = 1;
      features.has_calendar = 1;
      features.calendar_start_epoch = Math.floor(Date.now() / 1000) + 3600; // 1h from now

      const score = scorer.calculatePriority(features);

      // Should not apply auto-generated penalty
      expect(score.score).toBeGreaterThanOrEqual(50);
      expect(score.reasoning).not.toContain('Auto-generated email');
    });

    it('should heavily penalize OTP codes (-35 points)', () => {
      const features = createBaselineFeatures();
      features.otp_detected = 1;
      features.otp_age_minutes = 2;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeLessThan(30);
      expect(score.category).toBe('spam');
      expect(score.reasoning.some(r => r.includes('OTP') || r.includes('2FA'))).toBe(true);
      expect(score.confidence).toBeLessThanOrEqual(0.6);
    });
  });

  describe('Positive Signals', () => {
    it('should boost for strong relationship (0.9 → +27 points)', () => {
      const features = createBaselineFeatures();
      features.relationship_score = 0.9;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThan(70);
      expect(score.reasoning.some(r => r.includes('Strong relationship'))).toBe(true);
    });

    it('should boost for VIP sender (+15 points)', () => {
      const features = createBaselineFeatures();
      features.is_vip_sender = 1;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(65);
      expect(score.reasoning).toContain('VIP sender (manually flagged)');
    });

    it('should boost for explicit question (+20 points)', () => {
      const features = createBaselineFeatures();
      features.explicit_ask = 1;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(70);
      expect(score.reasoning).toContain('Contains explicit question or request');
    });

    it('should boost for deadline (+15 points)', () => {
      const features = createBaselineFeatures();
      features.deadline_epoch = Math.floor(Date.now() / 1000) + 86400; // Tomorrow
      features.time_to_deadline_min = 1440; // 24 hours

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(65);
      expect(score.reasoning).toContain('Email has deadline');
    });

    it('should boost significantly for urgent deadline (<24h, +40 points total)', () => {
      const features = createBaselineFeatures();
      features.deadline_epoch = Math.floor(Date.now() / 1000) + 3600; // 1h from now
      features.time_to_deadline_min = 60; // 1 hour

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(85);
      expect(score.reasoning.some(r => r.includes('Deadline in') && r.includes('urgent'))).toBe(true);
      expect(score.confidence).toBeGreaterThan(0.8);
    });

    it('should boost for thread continuation (+20 points)', () => {
      const features = createBaselineFeatures();
      features.thread_you_owe = 1;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(70);
      expect(score.reasoning).toContain('Conversation continuation (you owe a reply)');
    });

    it('should boost for high reply probability (0.8 → +20 points)', () => {
      const features = createBaselineFeatures();
      features.reply_need_prob = 0.8;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(70);
      expect(score.reasoning.some(r => r.includes('High reply probability'))).toBe(true);
    });
  });

  describe('Intent Modifiers', () => {
    it('should boost for confirm intent (+10 points)', () => {
      const features = createBaselineFeatures();
      features.content_intent = 'confirm';

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(60);
      expect(score.reasoning).toContain('Requires confirmation');
    });

    it('should boost for request intent (+5 points)', () => {
      const features = createBaselineFeatures();
      features.content_intent = 'request';

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(55);
      expect(score.reasoning).toContain('Action request');
    });

    it('should NOT modify score for schedule intent', () => {
      const features = createBaselineFeatures();
      features.content_intent = 'schedule';

      const score = scorer.calculatePriority(features);

      // Should be close to baseline (50 + relationship)
      expect(score.score).toBeGreaterThanOrEqual(45);
      expect(score.score).toBeLessThanOrEqual(70);
    });

    it('should slightly reduce for inform intent (-5 points)', () => {
      const features = createBaselineFeatures();
      features.content_intent = 'inform';

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeLessThan(50);
      expect(score.reasoning).toContain('Informational (lower priority)');
    });
  });

  describe('Category Boundaries', () => {
    it('should categorize as urgent (≥90)', () => {
      const features = createBaselineFeatures();
      features.relationship_score = 0.8;  // +24
      features.explicit_ask = 1;          // +20
      features.deadline_epoch = Math.floor(Date.now() / 1000) + 1800;  // 30min
      features.time_to_deadline_min = 30; // +40 (15 + 25 urgent bonus)
      features.is_vip_sender = 1;         // +15
      // Total: ~50 + 24 + 20 + 40 + 15 = 149 → capped at 100

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(90);
      expect(score.category).toBe('urgent');
    });

    it('should categorize as important (70-89)', () => {
      const features = createBaselineFeatures();
      features.relationship_score = 0.6;  // +18
      features.explicit_ask = 1;          // +20
      // Total: ~50 + 18 + 20 = 88 → should be in important range

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(70);
      expect(score.score).toBeLessThan(90);
      expect(score.category).toBe('important');
    });

    it('should categorize as normal (50-69)', () => {
      const features = createBaselineFeatures();
      features.relationship_score = 0.5;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(50);
      expect(score.score).toBeLessThan(70);
      expect(score.category).toBe('normal');
    });

    it('should categorize as low (30-49)', () => {
      const features = createBaselineFeatures();
      features.relationship_score = 0.0;  // No relationship
      features.content_intent = 'inform';  // -5

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(30);
      expect(score.score).toBeLessThan(50);
      expect(score.category).toBe('low');
    });

    it('should categorize as spam (<30)', () => {
      const features = createBaselineFeatures();
      features.is_newsletter = 1;  // -30

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeLessThan(30);
      expect(score.category).toBe('spam');
    });
  });

  describe('Special Cases', () => {
    it('should override to important for upcoming calendar event (<24h)', () => {
      const features = createBaselineFeatures();
      features.has_calendar = 1;
      features.calendar_start_epoch = Math.floor(Date.now() / 1000) + 7200; // 2h from now

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(70);
      expect(score.category).toBe('important');
      expect(score.reasoning.some(r => r.includes('Calendar invite'))).toBe(true);
      expect(score.confidence).toBeGreaterThan(0.8);
    });

    it('should NOT override for distant calendar events', () => {
      const features = createBaselineFeatures();
      features.has_calendar = 1;
      features.calendar_start_epoch = Math.floor(Date.now() / 1000) + 172800; // 2 days from now

      const score = scorer.calculatePriority(features);

      // Should not get the <24h boost
      expect(score.score).toBeLessThan(90);
    });

    it('should boost suspected security alerts to urgent', () => {
      const features = createBaselineFeatures();
      features.deadline_epoch = Math.floor(Date.now() / 1000) + 300; // 5 min from now
      features.time_to_deadline_min = 5;
      features.explicit_ask = 1;

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(85);
      expect(score.reasoning.some(r => r.includes('security alert'))).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple emails in batch', async () => {
      const features1 = createBaselineFeatures('email-001');
      const features2 = createBaselineFeatures('email-002');
      features2.is_vip_sender = 1;
      const features3 = createBaselineFeatures('email-003');
      features3.is_newsletter = 1;

      const scores = await scorer.calculatePrioritiesBatch([features1, features2, features3]);

      expect(scores).toHaveLength(3);
      expect(scores[0].email_id).toBe('email-001');
      expect(scores[1].email_id).toBe('email-002');
      expect(scores[2].email_id).toBe('email-003');

      // VIP should score higher than baseline
      expect(scores[1].score).toBeGreaterThan(scores[0].score);

      // Newsletter should score lower than baseline
      expect(scores[2].score).toBeLessThan(scores[0].score);
    });
  });

  describe('Explainability', () => {
    it('should provide feature importance ranking', () => {
      const features = createBaselineFeatures();
      features.relationship_score = 0.8;
      features.explicit_ask = 1;
      features.is_vip_sender = 1;

      const score = scorer.calculatePriority(features);
      const importance = scorer.getFeatureImportance(score);

      expect(importance.length).toBeGreaterThan(0);
      expect(importance[0]).toHaveProperty('feature');
      expect(importance[0]).toHaveProperty('weight');
      expect(importance[0]).toHaveProperty('impact');

      // All should be positive impacts
      expect(importance.every(i => i.impact === 'positive')).toBe(true);
    });

    it('should explain score in user-friendly format', () => {
      const features = createBaselineFeatures();
      features.explicit_ask = 1;
      features.deadline_epoch = Math.floor(Date.now() / 1000) + 3600;
      features.time_to_deadline_min = 60;

      const score = scorer.calculatePriority(features);
      const explanation = scorer.explainScore(score);

      expect(explanation).toContain('Priority:');
      expect(explanation).toContain('Reasons:');
      expect(explanation).toContain('Top contributing features:');
      expect(typeof explanation).toBe('string');
    });

    it('should show negative impacts for penalized emails', () => {
      const features = createBaselineFeatures();
      features.is_newsletter = 1;
      features.is_auto_generated = 1;

      const score = scorer.calculatePriority(features);
      const importance = scorer.getFeatureImportance(score);

      expect(importance.some(i => i.impact === 'negative')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should clamp score to 0-100 range (over 100)', () => {
      const features = createBaselineFeatures();
      // Max out all positive signals
      features.relationship_score = 1.0;
      features.is_vip_sender = 1;
      features.explicit_ask = 1;
      features.deadline_epoch = Math.floor(Date.now() / 1000) + 300;
      features.time_to_deadline_min = 5;
      features.thread_you_owe = 1;
      features.reply_need_prob = 1.0;
      features.content_intent = 'confirm';

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.score).toBeGreaterThanOrEqual(90);
    });

    it('should clamp score to 0-100 range (below 0)', () => {
      const features = createBaselineFeatures();
      // Max out all negative signals
      features.is_newsletter = 1;
      features.is_auto_generated = 1;
      features.otp_detected = 1;
      features.relationship_score = 0;
      features.content_intent = 'inform';

      const score = scorer.calculatePriority(features);

      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThan(30);
    });

    it('should handle null/missing optional fields gracefully', () => {
      const features = createBaselineFeatures();
      features.deadline_epoch = null;
      features.time_to_deadline_min = null;
      features.calendar_start_epoch = null;
      features.content_intent = null;

      expect(() => scorer.calculatePriority(features)).not.toThrow();
      const score = scorer.calculatePriority(features);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
    });
  });
});
