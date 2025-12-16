/**
 * RelationshipScorer Unit Tests
 *
 * Test scenarios:
 * - High importance senders (frequent two-way communication)
 * - Low importance senders (spam-like volume, no replies)
 * - New senders (no history)
 * - VIP senders (manual override)
 * - Edge cases (recency decay, email volume penalties)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RelationshipScorer, type EmailHistoryStats, type RelationshipScore } from '../RelationshipScorer.js';
import DatabaseManager from '../../../database.js';

// Mock DatabaseManager
vi.mock('../../../database.js', () => {
  const mockDb = {
    prepare: vi.fn(() => ({
      all: vi.fn(),
      run: vi.fn(),
      get: vi.fn()
    }))
  };

  return {
    default: {
      getInstance: vi.fn(() => ({
        db: mockDb
      }))
    }
  };
});

describe('RelationshipScorer', () => {
  let scorer: RelationshipScorer;
  const userEmail = 'user@example.com';

  beforeEach(() => {
    scorer = RelationshipScorer.getInstance();
  });

  describe('High Importance Sender Scenarios', () => {
    it('should score high for frequent two-way communication', async () => {
      // Mock database to return active communication history
      const mockStats: EmailHistoryStats = {
        emails_received: 20,
        emails_sent_to: 15,
        user_replies_count: 10,      // 50% reply rate (ideal)
        sender_replies_count: 8,
        two_way_exchanges: 8,
        first_contact_epoch: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60), // 90 days ago
        last_contact_epoch: Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60),   // 2 days ago (recent)
        avg_reply_latency_minutes: 120, // 2 hours
        total_interaction_days: 90
      };

      // Mock the analyzeEmailHistory method
      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore('important@example.com', userEmail);

      expect(result.score).toBeGreaterThan(0.7);
      expect(result.is_vip).toBe(0);
      expect(result.components.reply_frequency).toBeCloseTo(1.0, 1); // 50% reply rate is ideal
      expect(result.components.two_way_exchanges).toBeGreaterThan(0.4);
      expect(result.components.recency).toBeGreaterThan(0.9); // Recent contact

      analyzeHistorySpy.mockRestore();
    });

    it('should score high for VIP senders even with low volume', async () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 3,
        emails_sent_to: 2,
        user_replies_count: 2,
        sender_replies_count: 1,
        two_way_exchanges: 1,
        first_contact_epoch: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60),
        last_contact_epoch: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60),
        avg_reply_latency_minutes: 60,
        total_interaction_days: 30
      };

      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore(
        'vip@example.com',
        userEmail,
        true  // Manual VIP
      );

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.is_vip).toBe(1);
      expect(result.components.manual_vip).toBe(1.0);

      analyzeHistorySpy.mockRestore();
    });
  });

  describe('Low Importance Sender Scenarios', () => {
    it('should score low for spam-like senders (high volume, no replies)', async () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 150,  // Exceeds SPAM_THRESHOLD
        emails_sent_to: 0,
        user_replies_count: 0,
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60),
        last_contact_epoch: Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60),
        avg_reply_latency_minutes: null,
        total_interaction_days: 180
      };

      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore('spam@example.com', userEmail);

      expect(result.score).toBeLessThan(0.4);
      expect(result.components.reply_frequency).toBeLessThan(0.5);  // 0% reply rate
      expect(result.components.two_way_exchanges).toBe(0);
      expect(result.components.email_volume).toBeLessThan(0.5);  // Volume penalty

      analyzeHistorySpy.mockRestore();
    });

    it('should score low for dormant senders (old last contact)', async () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 10,
        emails_sent_to: 5,
        user_replies_count: 3,
        sender_replies_count: 2,
        two_way_exchanges: 2,
        first_contact_epoch: Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60), // 6 months ago
        last_contact_epoch: Math.floor(Date.now() / 1000) - (120 * 24 * 60 * 60),  // 4 months ago (stale)
        avg_reply_latency_minutes: 300,
        total_interaction_days: 60
      };

      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore('dormant@example.com', userEmail);

      expect(result.components.recency).toBeLessThan(0.3);  // Recency decay

      analyzeHistorySpy.mockRestore();
    });
  });

  describe('New Sender Scenarios', () => {
    it('should score neutral for new senders with no history', async () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 0,
        emails_sent_to: 0,
        user_replies_count: 0,
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: null,
        last_contact_epoch: null,
        avg_reply_latency_minutes: null,
        total_interaction_days: 0
      };

      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore('new@example.com', userEmail);

      // New senders should get neutral scores
      expect(result.score).toBeGreaterThanOrEqual(0.3);
      expect(result.score).toBeLessThanOrEqual(0.7);
      expect(result.components.reply_frequency).toBe(0.5);  // Neutral
      expect(result.components.recency).toBe(0);

      analyzeHistorySpy.mockRestore();
    });

    it('should score high for new sender with first positive interaction', async () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 2,
        emails_sent_to: 1,
        user_replies_count: 1,     // 50% reply rate on first emails
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60),  // Yesterday
        last_contact_epoch: Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60),
        avg_reply_latency_minutes: 30,
        total_interaction_days: 1
      };

      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore('firstcontact@example.com', userEmail);

      expect(result.components.reply_frequency).toBeCloseTo(1.0, 1);  // Ideal reply rate
      expect(result.components.recency).toBeGreaterThan(0.95);  // Very recent
      expect(result.components.email_volume).toBeLessThan(1.0);  // Low volume penalty

      analyzeHistorySpy.mockRestore();
    });
  });

  describe('Scoring Component Tests', () => {
    it('scoreReplyFrequency should peak at 50% reply rate', () => {
      const mockStats50: EmailHistoryStats = {
        emails_received: 10,
        emails_sent_to: 0,
        user_replies_count: 5,  // 50% reply rate
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: null,
        last_contact_epoch: null,
        avg_reply_latency_minutes: null,
        total_interaction_days: 0
      };

      const score50 = (scorer as any).scoreReplyFrequency(mockStats50);
      expect(score50).toBeCloseTo(1.0, 1);  // Perfect score

      const mockStats0: EmailHistoryStats = {
        ...mockStats50,
        user_replies_count: 0  // 0% reply rate
      };

      const score0 = (scorer as any).scoreReplyFrequency(mockStats0);
      expect(score0).toBeLessThan(0.5);

      const mockStats100: EmailHistoryStats = {
        ...mockStats50,
        user_replies_count: 10  // 100% reply rate
      };

      const score100 = (scorer as any).scoreReplyFrequency(mockStats100);
      expect(score100).toBeLessThan(score50);  // Over-replying is penalized
    });

    it('scoreEmailVolume should penalize excessive volume', () => {
      const mockStatsIdeal: EmailHistoryStats = {
        emails_received: 25,  // Sweet spot: 5-50 emails/6mo
        emails_sent_to: 0,
        user_replies_count: 0,
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: null,
        last_contact_epoch: null,
        avg_reply_latency_minutes: null,
        total_interaction_days: 0
      };

      const scoreIdeal = (scorer as any).scoreEmailVolume(mockStatsIdeal);
      expect(scoreIdeal).toBe(1.0);

      const mockStatsSpam: EmailHistoryStats = {
        ...mockStatsIdeal,
        emails_received: 200  // Way above threshold
      };

      const scoreSpam = (scorer as any).scoreEmailVolume(mockStatsSpam);
      expect(scoreSpam).toBeLessThan(0.5);

      const mockStatsFew: EmailHistoryStats = {
        ...mockStatsIdeal,
        emails_received: 2  // Too few
      };

      const scoreFew = (scorer as any).scoreEmailVolume(mockStatsFew);
      expect(scoreFew).toBeLessThan(1.0);
      expect(scoreFew).toBeCloseTo(0.4, 1);
    });

    it('scoreRecency should decay exponentially', () => {
      const now = Math.floor(Date.now() / 1000);

      const mockStats1Day: EmailHistoryStats = {
        emails_received: 0,
        emails_sent_to: 0,
        user_replies_count: 0,
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: null,
        last_contact_epoch: now - (1 * 24 * 60 * 60),  // 1 day ago
        avg_reply_latency_minutes: null,
        total_interaction_days: 0
      };

      const score1Day = (scorer as any).scoreRecency(mockStats1Day);
      expect(score1Day).toBeGreaterThan(0.95);

      const mockStats90Days: EmailHistoryStats = {
        ...mockStats1Day,
        last_contact_epoch: now - (90 * 24 * 60 * 60)  // 90 days ago (decay threshold)
      };

      const score90Days = (scorer as any).scoreRecency(mockStats90Days);
      expect(score90Days).toBeCloseTo(0.368, 1);  // e^-1 ≈ 0.368

      const mockStats180Days: EmailHistoryStats = {
        ...mockStats1Day,
        last_contact_epoch: now - (180 * 24 * 60 * 60)  // 180 days ago
      };

      const score180Days = (scorer as any).scoreRecency(mockStats180Days);
      expect(score180Days).toBeLessThan(score90Days);
      expect(score180Days).toBeCloseTo(0.135, 1);  // e^-2 ≈ 0.135
    });

    it('scoreTwoWayExchanges should reward bidirectional communication', () => {
      const mockStatsHigh: EmailHistoryStats = {
        emails_received: 10,
        emails_sent_to: 10,
        user_replies_count: 0,
        sender_replies_count: 0,
        two_way_exchanges: 10,  // 50% of total emails are exchanges
        first_contact_epoch: null,
        last_contact_epoch: null,
        avg_reply_latency_minutes: null,
        total_interaction_days: 0
      };

      const scoreHigh = (scorer as any).scoreTwoWayExchanges(mockStatsHigh);
      expect(scoreHigh).toBeCloseTo(1.0, 1);

      const mockStatsLow: EmailHistoryStats = {
        ...mockStatsHigh,
        two_way_exchanges: 1  // Only 5% are exchanges
      };

      const scoreLow = (scorer as any).scoreTwoWayExchanges(mockStatsLow);
      expect(scoreLow).toBeLessThan(0.2);

      const mockStatsNone: EmailHistoryStats = {
        ...mockStatsHigh,
        two_way_exchanges: 0
      };

      const scoreNone = (scorer as any).scoreTwoWayExchanges(mockStatsNone);
      expect(scoreNone).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle scores correctly at boundaries', async () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 0,
        emails_sent_to: 0,
        user_replies_count: 0,
        sender_replies_count: 0,
        two_way_exchanges: 0,
        first_contact_epoch: null,
        last_contact_epoch: null,
        avg_reply_latency_minutes: null,
        total_interaction_days: 0
      };

      const analyzeHistorySpy = vi.spyOn(scorer as any, 'analyzeEmailHistory')
        .mockResolvedValue(mockStats);

      const result = await scorer.calculateRelationshipScore('edge@example.com', userEmail);

      // Score should be clamped to [0, 1]
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);

      analyzeHistorySpy.mockRestore();
    });

    it('should handle null/missing values gracefully', () => {
      const mockStats: EmailHistoryStats = {
        emails_received: 5,
        emails_sent_to: 3,
        user_replies_count: 2,
        sender_replies_count: 1,
        two_way_exchanges: 1,
        first_contact_epoch: null,  // Missing
        last_contact_epoch: null,   // Missing
        avg_reply_latency_minutes: null,  // Missing
        total_interaction_days: 0
      };

      const recencyScore = (scorer as any).scoreRecency(mockStats);
      expect(recencyScore).toBe(0);  // Null last_contact should return 0, not throw
    });
  });

  describe('Weight Distribution', () => {
    it('should have weights that sum to 1.0', () => {
      const WEIGHTS = (RelationshipScorer as any).WEIGHTS;
      const sum = Object.values(WEIGHTS).reduce((a: any, b: any) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should prioritize reply frequency highest', () => {
      const WEIGHTS = (RelationshipScorer as any).WEIGHTS;
      expect(WEIGHTS.REPLY_FREQUENCY).toBeGreaterThan(WEIGHTS.TWO_WAY_EXCHANGES);
      expect(WEIGHTS.REPLY_FREQUENCY).toBeGreaterThan(WEIGHTS.RECENCY);
      expect(WEIGHTS.REPLY_FREQUENCY).toBeGreaterThan(WEIGHTS.EMAIL_VOLUME);
      expect(WEIGHTS.REPLY_FREQUENCY).toBeGreaterThan(WEIGHTS.MANUAL_VIP);
    });
  });
});
