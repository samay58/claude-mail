/**
 * Feature extraction module exports
 *
 * This module provides RFC-compliant email classification and feature extraction
 * for intelligent email prioritization.
 *
 * Design: Pure RFC header detection. Zero heuristics. Zero false positives.
 */

// RFC-compliant gates (unified)
export { RFCGates, type EmailHeaders, type Attachment } from './RFCGates.js';

// Feature analysis
export { RelationshipScorer, type EmailHistoryStats, type RelationshipScore } from './RelationshipScorer.js';
export { ContentAnalyzer, type ContentAnalysis } from './ContentAnalyzer.js';

// Main orchestration
export {
  FeatureExtractor,
  type MessageFeatures,
  type SenderRelationship
} from './FeatureExtractor.js';

// Priority scoring
export { PriorityScorer, type PriorityScore } from './PriorityScorer.js';

/**
 * RFC Standards Implemented:
 *
 * RFC 2369 - List-Unsubscribe header (newsletter detection)
 * RFC 2919 - List-ID header (mailing list identification)
 * RFC 3834 - Auto-Submitted header (auto-generated detection)
 * RFC 5545 - text/calendar MIME type (calendar invite detection)
 */
