/**
 * PriorityScorer - Final scoring layer for email prioritization
 *
 * Combines all extracted features into a final priority score (0-100)
 * using a weighted linear model inspired by Gmail Priority Inbox.
 *
 * Algorithm:
 * 1. Start with baseline score (50)
 * 2. Apply negative signals (newsletters, auto-generated, OTP)
 * 3. Apply positive signals (relationship, urgency, deadlines)
 * 4. Apply intent modifiers
 * 5. Handle special cases (calendar, security alerts)
 * 6. Clamp to 0-100 and categorize
 */

import { type MessageFeatures } from './FeatureExtractor.js';

export interface PriorityScore {
  email_id: string;
  score: number;              // 0-100 final priority
  category: 'urgent' | 'important' | 'normal' | 'low' | 'spam';
  confidence: number;         // 0-1 confidence in score
  reasoning: string[];        // Explainability
  feature_weights: Record<string, number>; // Which features contributed
}

export class PriorityScorer {
  private static instance: PriorityScorer;

  // Scoring weights for each feature category
  private static readonly WEIGHTS = {
    // Negative signals
    NEWSLETTER_PENALTY: -30,
    AUTO_GENERATED_PENALTY: -20,
    OTP_PENALTY: -35,

    // Positive signals
    RELATIONSHIP_MAX: 30,     // Max points from relationship_score (0-1)
    EXPLICIT_ASK: 20,
    DEADLINE_BONUS: 15,
    URGENT_DEADLINE_BONUS: 25,  // If deadline < 24h
    URGENCY_MULTIPLIER: 5,    // Points per urgency level (0-10)
    VIP_SENDER: 15,
    THREAD_YOU_OWE: 20,
    REPLY_NEED_MAX: 25,       // Max points from reply_need_prob (0-1)

    // Intent modifiers
    INTENT_CONFIRM: 10,
    INTENT_REQUEST: 5,
    INTENT_SCHEDULE: 0,
    INTENT_INFORM: -5
  };

  // Score boundaries for categories
  private static readonly CATEGORIES = {
    URGENT: 90,
    IMPORTANT: 70,
    NORMAL: 50,
    LOW: 30
  };

  private constructor() {}

  static getInstance(): PriorityScorer {
    if (!PriorityScorer.instance) {
      PriorityScorer.instance = new PriorityScorer();
    }
    return PriorityScorer.instance;
  }

  /**
   * Calculate priority score for a single email
   */
  calculatePriority(features: MessageFeatures): PriorityScore {
    let score = 50; // Baseline score
    const reasoning: string[] = [];
    const featureWeights: Record<string, number> = {};
    let confidence = 0.8; // Base confidence

    // ===================================================================
    // PHASE 1: NEGATIVE SIGNALS (reduce score)
    // ===================================================================

    if (features.is_newsletter) {
      score += PriorityScorer.WEIGHTS.NEWSLETTER_PENALTY;
      reasoning.push('Newsletter detected (RFC 2369/2919)');
      featureWeights['is_newsletter'] = PriorityScorer.WEIGHTS.NEWSLETTER_PENALTY;
    }

    if (features.is_auto_generated && !features.has_calendar) {
      // Don't penalize calendar invites (they're important auto-generated emails)
      score += PriorityScorer.WEIGHTS.AUTO_GENERATED_PENALTY;
      reasoning.push('Auto-generated email (RFC 3834)');
      featureWeights['is_auto_generated'] = PriorityScorer.WEIGHTS.AUTO_GENERATED_PENALTY;
    }

    if (features.otp_detected) {
      score += PriorityScorer.WEIGHTS.OTP_PENALTY;
      reasoning.push('OTP/2FA code detected (low interaction priority)');
      featureWeights['otp_detected'] = PriorityScorer.WEIGHTS.OTP_PENALTY;

      // OTP emails have lower confidence (time-sensitive but automated)
      confidence = Math.min(confidence, 0.6);
    }

    // ===================================================================
    // PHASE 2: POSITIVE SIGNALS (increase score)
    // ===================================================================

    // Relationship strength (0-1 scale → 0-30 points)
    if (features.relationship_score > 0) {
      const relationshipPoints = features.relationship_score * PriorityScorer.WEIGHTS.RELATIONSHIP_MAX;
      score += relationshipPoints;

      if (features.relationship_score > 0.7) {
        reasoning.push(`Strong relationship with sender (score: ${features.relationship_score.toFixed(2)})`);
      } else if (features.relationship_score > 0.4) {
        reasoning.push(`Moderate relationship with sender (score: ${features.relationship_score.toFixed(2)})`);
      }

      featureWeights['relationship_score'] = relationshipPoints;
    }

    // VIP sender
    if (features.is_vip_sender) {
      score += PriorityScorer.WEIGHTS.VIP_SENDER;
      reasoning.push('VIP sender (manually flagged)');
      featureWeights['is_vip_sender'] = PriorityScorer.WEIGHTS.VIP_SENDER;
    }

    // Explicit question/request
    if (features.explicit_ask) {
      score += PriorityScorer.WEIGHTS.EXPLICIT_ASK;
      reasoning.push('Contains explicit question or request');
      featureWeights['explicit_ask'] = PriorityScorer.WEIGHTS.EXPLICIT_ASK;
    }

    // Deadline exists
    if (features.deadline_epoch) {
      score += PriorityScorer.WEIGHTS.DEADLINE_BONUS;
      reasoning.push('Email has deadline');
      featureWeights['deadline_epoch'] = PriorityScorer.WEIGHTS.DEADLINE_BONUS;

      // Urgent deadline (< 24 hours)
      if (features.time_to_deadline_min !== null && features.time_to_deadline_min < 1440) {
        score += PriorityScorer.WEIGHTS.URGENT_DEADLINE_BONUS;
        const hours = Math.floor(features.time_to_deadline_min / 60);
        reasoning.push(`Deadline in ${hours}h (urgent)`);
        featureWeights['time_to_deadline_urgent'] = PriorityScorer.WEIGHTS.URGENT_DEADLINE_BONUS;
        confidence = Math.min(confidence + 0.1, 1.0); // Boost confidence
      }
    }

    // Urgency signals (0-10 scale → 0-50 points)
    // Note: urgency_level comes from ContentAnalyzer.detectUrgency()
    // We don't have direct access to urgency_level, but we can infer from content_intent
    // For now, we'll use deadline + explicit_ask as urgency proxies
    // TODO: Add urgency_level to MessageFeatures if needed

    // Thread continuation (you owe a reply)
    if (features.thread_you_owe) {
      score += PriorityScorer.WEIGHTS.THREAD_YOU_OWE;
      reasoning.push('Conversation continuation (you owe a reply)');
      featureWeights['thread_you_owe'] = PriorityScorer.WEIGHTS.THREAD_YOU_OWE;
    }

    // Reply prediction (0-1 scale → 0-25 points)
    if (features.reply_need_prob > 0.5) {
      const replyPoints = features.reply_need_prob * PriorityScorer.WEIGHTS.REPLY_NEED_MAX;
      score += replyPoints;
      reasoning.push(`High reply probability (${(features.reply_need_prob * 100).toFixed(0)}%)`);
      featureWeights['reply_need_prob'] = replyPoints;
    }

    // ===================================================================
    // PHASE 3: INTENT MODIFIERS
    // ===================================================================

    if (features.content_intent === 'confirm') {
      score += PriorityScorer.WEIGHTS.INTENT_CONFIRM;
      reasoning.push('Requires confirmation');
      featureWeights['intent_confirm'] = PriorityScorer.WEIGHTS.INTENT_CONFIRM;
    } else if (features.content_intent === 'request') {
      score += PriorityScorer.WEIGHTS.INTENT_REQUEST;
      reasoning.push('Action request');
      featureWeights['intent_request'] = PriorityScorer.WEIGHTS.INTENT_REQUEST;
    } else if (features.content_intent === 'inform') {
      score += PriorityScorer.WEIGHTS.INTENT_INFORM;
      reasoning.push('Informational (lower priority)');
      featureWeights['intent_inform'] = PriorityScorer.WEIGHTS.INTENT_INFORM;
    }

    // ===================================================================
    // PHASE 4: SPECIAL CASES & OVERRIDES
    // ===================================================================

    // Calendar invite with upcoming event (< 24h)
    if (features.has_calendar && features.calendar_start_epoch) {
      const now = Math.floor(Date.now() / 1000);
      const timeToEvent = features.calendar_start_epoch - now;
      const hoursToEvent = timeToEvent / 3600;

      if (hoursToEvent > 0 && hoursToEvent < 24) {
        // Override to 'important' category minimum
        score = Math.max(score, PriorityScorer.CATEGORIES.IMPORTANT);
        reasoning.push(`Calendar invite: event in ${Math.floor(hoursToEvent)}h`);
        confidence = Math.min(confidence + 0.15, 1.0);
      }
    }

    // Security alert patterns (check if this looks like a security email)
    // We can infer from high urgency + deadline + specific keywords
    // This is a heuristic - in a real system, we'd check sender/subject patterns
    if (features.deadline_epoch && features.time_to_deadline_min !== null &&
        features.time_to_deadline_min < 360 && // < 6 hours
        features.explicit_ask) {
      // Possible security alert - boost to urgent
      score = Math.max(score, PriorityScorer.CATEGORIES.URGENT - 5);
      reasoning.push('Potential security alert (urgent + short deadline)');
      confidence = 0.7; // Lower confidence for heuristic detection
    }

    // ===================================================================
    // PHASE 5: FINALIZE SCORE & CATEGORIZE
    // ===================================================================

    // Clamp score to 0-100 range
    score = Math.max(0, Math.min(100, score));

    // Determine category based on score
    let category: 'urgent' | 'important' | 'normal' | 'low' | 'spam';
    if (score >= PriorityScorer.CATEGORIES.URGENT) {
      category = 'urgent';
    } else if (score >= PriorityScorer.CATEGORIES.IMPORTANT) {
      category = 'important';
    } else if (score >= PriorityScorer.CATEGORIES.NORMAL) {
      category = 'normal';
    } else if (score >= PriorityScorer.CATEGORIES.LOW) {
      category = 'low';
    } else {
      category = 'spam';
    }

    // Clamp confidence
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      email_id: features.email_id,
      score: Math.round(score), // Round to integer
      category,
      confidence,
      reasoning,
      feature_weights: featureWeights
    };
  }

  /**
   * Batch calculate priorities for multiple emails
   */
  async calculatePrioritiesBatch(
    featuresArray: MessageFeatures[]
  ): Promise<PriorityScore[]> {
    return featuresArray.map(features => this.calculatePriority(features));
  }

  /**
   * Get feature importance for explainability
   * Returns sorted list of features by their contribution to the score
   */
  getFeatureImportance(priorityScore: PriorityScore): Array<{
    feature: string;
    weight: number;
    impact: 'positive' | 'negative' | 'neutral';
  }> {
    const importance = Object.entries(priorityScore.feature_weights)
      .map(([feature, weight]) => ({
        feature,
        weight: Math.abs(weight),
        impact: weight > 0 ? 'positive' as const :
                weight < 0 ? 'negative' as const :
                'neutral' as const
      }))
      .sort((a, b) => b.weight - a.weight);

    return importance;
  }

  /**
   * Explain why this email got its priority score (user-friendly)
   */
  explainScore(priorityScore: PriorityScore): string {
    const { score, category, reasoning } = priorityScore;

    let explanation = `Priority: ${category.toUpperCase()} (${score}/100)\n\n`;
    explanation += `Reasons:\n`;
    reasoning.forEach((reason, index) => {
      explanation += `  ${index + 1}. ${reason}\n`;
    });

    const importance = this.getFeatureImportance(priorityScore);
    if (importance.length > 0) {
      explanation += `\nTop contributing features:\n`;
      importance.slice(0, 5).forEach((item, index) => {
        const sign = item.impact === 'positive' ? '+' : '-';
        explanation += `  ${index + 1}. ${item.feature}: ${sign}${item.weight.toFixed(1)} points\n`;
      });
    }

    return explanation;
  }
}
