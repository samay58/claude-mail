#!/usr/bin/env tsx
/**
 * SENT Folder Backfill Script
 *
 * One-time script to fetch 6 months of SENT emails for accurate relationship scoring.
 * The relationship scorer needs SENT data to calculate bidirectional interaction metrics.
 *
 * Usage: npm run backfill:sent
 *
 * This script:
 * 1. Fetches all SENT emails from the last 6 months via IMAP
 * 2. Stores them in the database with folder_type='sent'
 * 3. Rebuilds all sender_relationships records
 * 4. Rescores all emails with updated relationship data
 */

import 'dotenv/config';
import ImapManager from '../imap.js';
import DatabaseManager from '../database.js';
import { FeatureExtractor } from '../core/features/FeatureExtractor.js';
import { PriorityScorer } from '../core/features/PriorityScorer.js';
import { RelationshipScorer } from '../core/features/RelationshipScorer.js';

const BACKFILL_MONTHS = 6;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SENT Folder Backfill - Relationship Data Population');
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  const startTime = Date.now();

  try {
    // Initialize managers
    const imap = ImapManager.getInstance();
    const db = DatabaseManager.getInstance();

    console.log(`[1/4] Fetching ${BACKFILL_MONTHS} months of SENT emails...`);
    console.log();

    // Fetch historical SENT emails with progress reporting
    const sentEmails = await imap.getHistoricalSentEmails(
      BACKFILL_MONTHS,
      (count, total) => {
        const percent = Math.round((count / total) * 100);
        process.stdout.write(`\r      Progress: ${count}/${total} emails (${percent}%)`);
      }
    );

    console.log(); // New line after progress
    console.log(`      ✓ Fetched ${sentEmails.length} SENT emails`);
    console.log();

    if (sentEmails.length === 0) {
      console.log('⚠️  No SENT emails found. Check your IMAP configuration.');
      console.log('    Make sure EMAIL_ADDRESS and EMAIL_APP_PASSWORD are set correctly.');
      process.exit(1);
    }

    // Store SENT emails in database
    console.log('[2/4] Storing SENT emails in database...');

    let newCount = 0;
    let existingCount = 0;

    for (const email of sentEmails) {
      const emailRecord = {
        id: email.id,
        thread_id: email.threadId,
        message_id: email.messageId,
        subject: email.subject,
        sender_email: email.from.email,
        sender_name: email.from.name || '',
        recipient_emails: JSON.stringify(email.to.map(t => t.email)),
        date: email.date.toISOString(),
        body_text: email.bodyText || '',
        body_html: email.bodyHtml || '',
        snippet: email.snippet,
        is_read: email.isRead,
        is_starred: false,
        is_important: false,
        folder: email.folder || '[Gmail]/Sent Mail',
        folder_type: 'sent',
        labels: JSON.stringify([])
      };

      const isNew = db.insertEmail(emailRecord);
      if (isNew) {
        newCount++;
      } else {
        existingCount++;
      }
    }

    console.log(`      ✓ Inserted ${newCount} new emails`);
    console.log(`      ✓ Updated ${existingCount} existing emails`);
    console.log();

    // Rebuild relationship scores
    console.log('[3/4] Rebuilding relationship scores...');

    const relationshipScorer = RelationshipScorer.getInstance();
    const userEmail = process.env.EMAIL_ADDRESS || process.env.IMAP_USER || '';
    let relationshipsUpdated = 0;

    if (!userEmail) {
      console.error('      ⚠️  EMAIL_ADDRESS not set. Skipping relationship rebuild.');
    } else {
      // Get unique senders from INBOX emails
      const inboxSenders = getUniqueSenders(db);
      console.log(`      Found ${inboxSenders.length} unique senders to analyze`);

      for (const senderEmail of inboxSenders) {
        try {
          // This will recalculate based on new SENT data
          await relationshipScorer.calculateRelationshipScore(senderEmail, userEmail);
          relationshipsUpdated++;

          if (relationshipsUpdated % 50 === 0) {
            process.stdout.write(`\r      Progress: ${relationshipsUpdated}/${inboxSenders.length} relationships`);
          }
        } catch (error) {
          // Skip errors for individual senders
        }
      }

      console.log(); // New line after progress
      console.log(`      ✓ Updated ${relationshipsUpdated} sender relationships`);
    }
    console.log();

    // Rescore all INBOX emails
    console.log('[4/4] Rescoring INBOX emails with updated relationships...');

    const inboxEmails = getInboxEmails(db);
    console.log(`      Found ${inboxEmails.length} INBOX emails to rescore`);

    const extractor = FeatureExtractor.getInstance();
    const scorer = PriorityScorer.getInstance();

    let rescored = 0;
    for (const email of inboxEmails) {
      try {
        // Extract features with updated relationship data
        // EmailRecord uses string date, so pass the email record directly
        const features = await extractor.extractFeatures(email);

        // Calculate new priority
        const result = scorer.calculatePriority(features);

        // Save to AI cache
        db.saveAICache(email.id, {
          priority_score: result.score,
          priority_category: result.category,
          priority_reason: result.reasoning.join('; ')
        });

        rescored++;

        if (rescored % 25 === 0) {
          process.stdout.write(`\r      Progress: ${rescored}/${inboxEmails.length} emails`);
        }
      } catch (error) {
        // Skip errors for individual emails
      }
    }

    console.log(); // New line after progress
    console.log(`      ✓ Rescored ${rescored} emails`);
    console.log();

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Backfill Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();
    console.log(`  SENT emails fetched:     ${sentEmails.length}`);
    console.log(`  New emails stored:       ${newCount}`);
    console.log(`  Relationships updated:   ${relationshipsUpdated}`);
    console.log(`  Emails rescored:         ${rescored}`);
    console.log(`  Time elapsed:            ${elapsed}s`);
    console.log();

    // Disconnect IMAP
    imap.disconnect();

    process.exit(0);

  } catch (error) {
    console.error();
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

/**
 * Get unique sender emails from INBOX
 */
function getUniqueSenders(db: DatabaseManager): string[] {
  const rawDb = (db as any).db;
  const result = rawDb.prepare(`
    SELECT DISTINCT sender_email
    FROM emails
    WHERE folder_type = 'inbox' OR folder_type IS NULL
  `).all() as { sender_email: string }[];

  return result.map(r => r.sender_email);
}

/**
 * Get all INBOX emails for rescoring
 */
function getInboxEmails(db: DatabaseManager): any[] {
  const rawDb = (db as any).db;
  return rawDb.prepare(`
    SELECT * FROM emails
    WHERE folder_type = 'inbox' OR folder_type IS NULL
    ORDER BY date DESC
  `).all();
}

// Run the backfill
main();
