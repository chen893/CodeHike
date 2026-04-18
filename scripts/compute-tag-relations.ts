/**
 * Compute tag relations from co-occurrence frequency + same-tagType supplement (D-14).
 *
 * Usage: npx tsx scripts/compute-tag-relations.ts
 *
 * This script:
 * 1. Computes co-occurrence relations (tags that appear together on the same tutorial)
 * 2. Supplements with same-tagType relations for tags with no co-occurrence data
 * 3. Logs summary statistics
 */

import {
  computeCoOccurrence,
  computeSameTypeSupplement,
} from '../lib/repositories/tag-relation-repository';

async function main() {
  console.log('[compute-tag-relations] Starting tag relation computation...');

  const startTime = Date.now();

  // Step 1: Co-occurrence calculation
  console.log('[compute-tag-relations] Computing co-occurrence relations...');
  const coOccurrenceCount = await computeCoOccurrence();
  console.log(
    `[compute-tag-relations] Computed ${coOccurrenceCount} co-occurrence relations`,
  );

  // Step 2: Same-tagType supplement
  console.log(
    '[compute-tag-relations] Computing same-tagType supplements...',
  );
  const sameTypeCount = await computeSameTypeSupplement();
  console.log(
    `[compute-tag-relations] Added ${sameTypeCount} same-type supplements`,
  );

  const elapsed = Date.now() - startTime;
  console.log(
    `[compute-tag-relations] Done in ${elapsed}ms. Total: ${coOccurrenceCount} co-occurrence, ${sameTypeCount} same-type supplements`,
  );
}

main().catch((err) => {
  console.error('[compute-tag-relations] Fatal error:', err);
  process.exit(1);
});
