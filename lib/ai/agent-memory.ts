/**
 * Session Memory for the Agent Loop
 *
 * Tracks repair history, successful strategies, and drift detection
 * across a single generation session. Designed for DB persistence via
 * toSnapshot/restoreFromSnapshot.
 *
 * Key design decisions:
 *   - Working memory is per-step (inside agent-generator.ts)
 *   - Session memory spans the full generation (this module)
 *   - Project memory is future scope (cross-generation patterns)
 */

import type { StepOutcome, RepairRecord } from './agent-runtime/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMemorySnapshot {
  stepOutcomes: StepOutcome[];
  repairHistory: RepairRecord[];
  successfulStrategies: string[];
}

export interface SessionMemory {
  /** Record the outcome of a completed step. */
  recordStepOutcome(outcome: StepOutcome): void;
  /** Record a repair attempt. */
  recordRepair(record: RepairRecord): void;
  /** Get all completed-step outcomes. */
  getStepOutcomes(): StepOutcome[];
  /** Get all repair history. */
  getRepairHistory(): RepairRecord[];
  /** Get strategies that succeeded (for injection into prompts). */
  getSuccessfulStrategies(): string[];
  /** Detect if the generation is drifting (consecutive degraded steps). */
  detectDrift(): { drifting: boolean; consecutiveDegraded: number };
  /** Serialize to JSON for DB persistence. */
  toSnapshot(): SessionMemorySnapshot;
  /** Restore from DB snapshot. */
  restoreFromSnapshot(snapshot: SessionMemorySnapshot): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a session memory instance.
 *
 * @param existingSnapshot Optional snapshot from a previous session
 *   (used for crash recovery — restore state from DB checkpoint).
 */
export function createSessionMemory(
  existingSnapshot?: SessionMemorySnapshot,
): SessionMemory {
  const stepOutcomes: StepOutcome[] = existingSnapshot?.stepOutcomes ?? [];
  const repairHistory: RepairRecord[] = existingSnapshot?.repairHistory ?? [];
  const successfulStrategies: string[] = existingSnapshot?.successfulStrategies ?? [];

  return {
    recordStepOutcome(outcome: StepOutcome) {
      stepOutcomes.push(outcome);
      // Track successful strategies: single-attempt repairs are the
      // most informative pattern for future prompt optimization.
      if (outcome.result === 'repaired' && outcome.repairCount === 1) {
        successfulStrategies.push(
          `Step ${outcome.stepIndex + 1}: single-attempt ${outcome.patchStrategy} repair succeeded`,
        );
      }
    },

    recordRepair(record: RepairRecord) {
      repairHistory.push(record);
    },

    getStepOutcomes() {
      return [...stepOutcomes];
    },

    getRepairHistory() {
      return [...repairHistory];
    },

    getSuccessfulStrategies() {
      return [...successfulStrategies];
    },

    detectDrift() {
      // Check for consecutive degraded (replanned) outcomes from the end.
      // Two or more consecutive replanned steps indicate the generation
      // is drifting away from the outline's intent.
      let consecutiveDegraded = 0;
      for (let i = stepOutcomes.length - 1; i >= 0; i--) {
        if (stepOutcomes[i].result === 'replanned') {
          consecutiveDegraded++;
        } else {
          break;
        }
      }
      return {
        drifting: consecutiveDegraded >= 2,
        consecutiveDegraded,
      };
    },

    toSnapshot(): SessionMemorySnapshot {
      return {
        stepOutcomes: [...stepOutcomes],
        repairHistory: [...repairHistory],
        successfulStrategies: [...successfulStrategies],
      };
    },

    restoreFromSnapshot(snapshot: SessionMemorySnapshot) {
      stepOutcomes.length = 0;
      stepOutcomes.push(...snapshot.stepOutcomes);
      repairHistory.length = 0;
      repairHistory.push(...snapshot.repairHistory);
      successfulStrategies.length = 0;
      successfulStrategies.push(...snapshot.successfulStrategies);
    },
  };
}
