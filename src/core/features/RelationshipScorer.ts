/**
 * RelationshipScorer - Calculate sender importance based on interaction history
 *
 * Uses 6-month lookback window for performance optimization.
 * Applies weighted scoring algorithm inspired by Gmail Priority Inbox research.
 *
 * Score formula:
 *   relationship_score = weighted_sum(
 *     reply_frequency: 0.35,
 *     two_way_exchanges: 0.25,
 *     recency: 0.20,
 *     email_volume: 0.10,
 *     manual_vip: 0.10
 *   )
 */

import DatabaseManager, { EmailRecord } from '../../database.js';

export interface EmailHistoryStats {
  emails_received: number;
  emails_sent_to: number;
  user_replies_count: number;     // How many times user replied
  sender_replies_count: number;   // How many times sender replied to user
  two_way_exchanges: number;      // Bidirectional conversations
  first_contact_epoch: number | null;
  last_contact_epoch: number | null;
  avg_reply_latency_minutes: number | null;
  total_interaction_days: number;
}

export interface RelationshipScore {
  sender_email: string;
  score: number;  // 0.0 to 1.0
  is_vip: number; // 0 or 1
  components: {
    reply_frequency: number;
    two_way_exchanges: number;
    recency: number;
    email_volume: number;
    manual_vip: number;
  };
  stats: EmailHistoryStats;
}

export class RelationshipScorer {
  private static instance: RelationshipScorer;
  private db: DatabaseManager;

  // Scoring weights (sum to 1.0)
  private static readonly WEIGHTS = {
    REPLY_FREQUENCY: 0.35,
    TWO_WAY_EXCHANGES: 0.25,
    RECENCY: 0.20,
    EMAIL_VOLUME: 0.10,
    MANUAL_VIP: 0.10
  };

  // Constants for scoring logic
  private static readonly SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  private static readonly IDEAL_REPLY_RATIO = 0.5;  // 50% reply rate is ideal
  private static readonly SPAM_THRESHOLD = 100;     // >100 emails/6mo suggests newsletter
  private static readonly RECENCY_DECAY_DAYS = 90;  // 3 months for recency scoring

  private constructor() {
    this.db = DatabaseManager.getInstance();
  }

  static getInstance(): RelationshipScorer {
    if (!RelationshipScorer.instance) {
      RelationshipScorer.instance = new RelationshipScorer();
    }
    return RelationshipScorer.instance;
  }

  /**
   * Calculate relationship score for a sender
   * Uses 6-month lookback window for performance
   */
  async calculateRelationshipScore(
    senderEmail: string,
    userEmail: string,
    isManualVIP = false
  ): Promise<RelationshipScore> {
    // Get email history from last 6 months
    const stats = await this.analyzeEmailHistory(senderEmail, userEmail);

    // Calculate individual components
    const replyFrequencyScore = this.scoreReplyFrequency(stats);
    const twoWayExchangeScore = this.scoreTwoWayExchanges(stats);
    const recencyScore = this.scoreRecency(stats);
    const emailVolumeScore = this.scoreEmailVolume(stats);
    const manualVIPScore = isManualVIP ? 1.0 : 0.0;

    // Weighted sum
    const compositeScore =
      replyFrequencyScore * RelationshipScorer.WEIGHTS.REPLY_FREQUENCY +
      twoWayExchangeScore * RelationshipScorer.WEIGHTS.TWO_WAY_EXCHANGES +
      recencyScore * RelationshipScorer.WEIGHTS.RECENCY +
      emailVolumeScore * RelationshipScorer.WEIGHTS.EMAIL_VOLUME +
      manualVIPScore * RelationshipScorer.WEIGHTS.MANUAL_VIP;

    // Apply neutral baseline for completely new senders (no history)
    // This prevents new senders from being unfairly penalized
    const isNewSender = stats.emails_received === 0 && stats.emails_sent_to === 0;
    const finalScore = isNewSender
      ? 0.5  // Neutral baseline for unknown senders
      : Math.max(0, Math.min(1, compositeScore));

    return {
      sender_email: senderEmail,
      score: finalScore,
      is_vip: isManualVIP ? 1 : 0,
      components: {
        reply_frequency: replyFrequencyScore,
        two_way_exchanges: twoWayExchangeScore,
        recency: recencyScore,
        email_volume: emailVolumeScore,
        manual_vip: manualVIPScore
      },
      stats
    };
  }

  /**
   * Analyze email history for a sender (last 6 months)
   */
  private async analyzeEmailHistory(
    senderEmail: string,
    userEmail: string
  ): Promise<EmailHistoryStats> {
    const sixMonthsAgo = new Date(Date.now() - RelationshipScorer.SIX_MONTHS_MS);
    const sixMonthsAgoISO = sixMonthsAgo.toISOString();

    // Get all emails from this sender (received by user)
    const receivedEmails = this.db['db']
      .prepare(`
        SELECT * FROM emails
        WHERE sender_email = ? AND date >= ?
        ORDER BY date ASC
      `)
      .all(senderEmail, sixMonthsAgoISO) as EmailRecord[];

    // Get all emails sent to this sender (sent by user)
    const sentEmails = this.db['db']
      .prepare(`
        SELECT * FROM emails
        WHERE sender_email = ? AND recipient_emails LIKE ?
        AND date >= ?
        ORDER BY date ASC
      `)
      .all(userEmail, `%${senderEmail}%`, sixMonthsAgoISO) as EmailRecord[];

    // Count user replies (user sent email after receiving from sender)
    const userRepliesCount = this.countUserReplies(receivedEmails, sentEmails);

    // Count sender replies (sender sent email after user)
    const senderRepliesCount = this.countSenderReplies(sentEmails, receivedEmails);

    // Count two-way exchanges (back-and-forth conversations)
    const twoWayExchanges = Math.min(userRepliesCount, senderRepliesCount);

    // Calculate average reply latency
    const avgReplyLatency = this.calculateAverageReplyLatency(receivedEmails, sentEmails);

    // Get first and last contact timestamps
    const allEmails = [...receivedEmails, ...sentEmails].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const firstContact = allEmails.length > 0
      ? Math.floor(new Date(allEmails[0].date).getTime() / 1000)
      : null;

    const lastContact = allEmails.length > 0
      ? Math.floor(new Date(allEmails[allEmails.length - 1].date).getTime() / 1000)
      : null;

    // Calculate total interaction days
    const totalInteractionDays = firstContact && lastContact
      ? Math.ceil((lastContact - firstContact) / (24 * 60 * 60))
      : 0;

    return {
      emails_received: receivedEmails.length,
      emails_sent_to: sentEmails.length,
      user_replies_count: userRepliesCount,
      sender_replies_count: senderRepliesCount,
      two_way_exchanges: twoWayExchanges,
      first_contact_epoch: firstContact,
      last_contact_epoch: lastContact,
      avg_reply_latency_minutes: avgReplyLatency,
      total_interaction_days: totalInteractionDays
    };
  }

  /**
   * Count how many times user replied to sender
   */
  private countUserReplies(receivedEmails: EmailRecord[], sentEmails: EmailRecord[]): number {
    let count = 0;

    for (const sentEmail of sentEmails) {
      const sentTime = new Date(sentEmail.date).getTime();

      // Check if there's a received email within 7 days before this sent email
      const hasRecentReceived = receivedEmails.some(received => {
        const receivedTime = new Date(received.date).getTime();
        const timeDiff = sentTime - receivedTime;
        return timeDiff > 0 && timeDiff < 7 * 24 * 60 * 60 * 1000; // Within 7 days
      });

      if (hasRecentReceived) {
        count++;
      }
    }

    return count;
  }

  /**
   * Count how many times sender replied to user
   */
  private countSenderReplies(sentEmails: EmailRecord[], receivedEmails: EmailRecord[]): number {
    let count = 0;

    for (const receivedEmail of receivedEmails) {
      const receivedTime = new Date(receivedEmail.date).getTime();

      // Check if there's a sent email within 7 days before this received email
      const hasRecentSent = sentEmails.some(sent => {
        const sentTime = new Date(sent.date).getTime();
        const timeDiff = receivedTime - sentTime;
        return timeDiff > 0 && timeDiff < 7 * 24 * 60 * 60 * 1000; // Within 7 days
      });

      if (hasRecentSent) {
        count++;
      }
    }

    return count;
  }

  /**
   * Calculate average reply latency in minutes
   */
  private calculateAverageReplyLatency(
    receivedEmails: EmailRecord[],
    sentEmails: EmailRecord[]
  ): number | null {
    const latencies: number[] = [];

    for (const sentEmail of sentEmails) {
      const sentTime = new Date(sentEmail.date).getTime();

      // Find most recent received email before this sent email
      const recentReceived = receivedEmails
        .filter(r => new Date(r.date).getTime() < sentTime)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (recentReceived) {
        const receivedTime = new Date(recentReceived.date).getTime();
        const latencyMs = sentTime - receivedTime;
        const latencyMinutes = latencyMs / (1000 * 60);

        // Only count reasonable latencies (< 7 days)
        if (latencyMinutes < 7 * 24 * 60) {
          latencies.push(latencyMinutes);
        }
      }
    }

    if (latencies.length === 0) return null;

    const sum = latencies.reduce((a, b) => a + b, 0);
    return sum / latencies.length;
  }

  /**
   * Score reply frequency component (0.0 to 1.0)
   * Ideal: ~50% reply rate (too low = not engaged, too high = spam)
   */
  private scoreReplyFrequency(stats: EmailHistoryStats): number {
    if (stats.emails_received === 0) return 0.5; // Neutral for new senders

    const replyRatio = stats.user_replies_count / stats.emails_received;

    // Score peaks at ideal reply ratio (50%)
    const deviation = Math.abs(replyRatio - RelationshipScorer.IDEAL_REPLY_RATIO);
    const score = Math.max(0, 1 - (deviation * 2)); // Linear decay

    return score;
  }

  /**
   * Score two-way exchanges component (0.0 to 1.0)
   * Rewards bidirectional conversations
   */
  private scoreTwoWayExchanges(stats: EmailHistoryStats): number {
    const totalEmails = stats.emails_received + stats.emails_sent_to;
    if (totalEmails === 0) return 0;

    // Normalize by total email count (more exchanges relative to volume = higher score)
    const exchangeRatio = stats.two_way_exchanges / totalEmails;

    // Cap at 0.5 (50% exchange rate is excellent)
    return Math.min(1.0, exchangeRatio * 2);
  }

  /**
   * Score recency component (0.0 to 1.0)
   * Recent interactions score higher
   */
  private scoreRecency(stats: EmailHistoryStats): number {
    if (!stats.last_contact_epoch) return 0;

    const now = Math.floor(Date.now() / 1000);
    const daysSinceContact = (now - stats.last_contact_epoch) / (24 * 60 * 60);

    // Exponential decay over RECENCY_DECAY_DAYS
    const decayFactor = daysSinceContact / RelationshipScorer.RECENCY_DECAY_DAYS;
    const score = Math.exp(-decayFactor);

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Score email volume component (0.0 to 1.0)
   * Too many emails = newsletter/spam penalty
   */
  private scoreEmailVolume(stats: EmailHistoryStats): number {
    // Sweet spot: 5-50 emails per 6 months
    if (stats.emails_received < 5) {
      // Too few: scale linearly
      return stats.emails_received / 5;
    } else if (stats.emails_received <= 50) {
      // Ideal range: full score
      return 1.0;
    } else {
      // Too many: spam/newsletter penalty
      const penalty = (stats.emails_received - 50) / RelationshipScorer.SPAM_THRESHOLD;
      return Math.max(0, 1 - penalty);
    }
  }

  /**
   * Update sender_relationships table with new score
   */
  async updateSenderRelationship(
    senderEmail: string,
    userEmail: string,
    isManualVIP = false
  ): Promise<void> {
    const scoreResult = await this.calculateRelationshipScore(senderEmail, userEmail, isManualVIP);

    // Insert or update sender_relationships table
    this.db['db']
      .prepare(`
        INSERT INTO sender_relationships (
          sender_email,
          emails_received,
          emails_sent_to,
          user_replies_count,
          sender_replies_count,
          two_way_exchanges,
          first_contact_epoch,
          last_contact_epoch,
          avg_reply_latency_minutes,
          relationship_score,
          is_vip,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(sender_email) DO UPDATE SET
          emails_received = excluded.emails_received,
          emails_sent_to = excluded.emails_sent_to,
          user_replies_count = excluded.user_replies_count,
          sender_replies_count = excluded.sender_replies_count,
          two_way_exchanges = excluded.two_way_exchanges,
          last_contact_epoch = excluded.last_contact_epoch,
          avg_reply_latency_minutes = excluded.avg_reply_latency_minutes,
          relationship_score = excluded.relationship_score,
          is_vip = excluded.is_vip,
          updated_at = strftime('%s', 'now')
      `)
      .run(
        scoreResult.sender_email,
        scoreResult.stats.emails_received,
        scoreResult.stats.emails_sent_to,
        scoreResult.stats.user_replies_count,
        scoreResult.stats.sender_replies_count,
        scoreResult.stats.two_way_exchanges,
        scoreResult.stats.first_contact_epoch,
        scoreResult.stats.last_contact_epoch,
        scoreResult.stats.avg_reply_latency_minutes,
        scoreResult.score,
        scoreResult.is_vip
      );
  }

  /**
   * Get existing relationship score from database
   */
  getRelationshipFromDB(senderEmail: string): {
    relationship_score: number;
    is_vip: number;
  } | null {
    const result = this.db['db']
      .prepare('SELECT relationship_score, is_vip FROM sender_relationships WHERE sender_email = ?')
      .get(senderEmail) as any;

    return result || null;
  }
}