#!/usr/bin/env node
/**
 * vote_simulator.mjs — Simulate voting outcomes for proposals.
 *
 * Given current vote tally and remaining time, estimate:
 *   - Probability proposal passes
 *   - Expected vote share at end
 *   - Quorum likelihood
 *
 * Useful for agents deciding whether to vote / how much voting power to use.
 */

const QUORUM_THRESHOLD = 0.5; // 50% quorum default

export function simulateVoteOutcome(params) {
  const {
    yesVotes,
    noVotes,
    abstainVotes = 0,
    maxVoteWeight,
    remainingSeconds = 0,
    estimatedAdditionalVoters = 0,
    avgAdditionalVoterWeight = 0,
    pessimisticAssumption = 0.5, // Assume additional voters vote against by default
  } = params;

  const currentTotal = yesVotes + noVotes + abstainVotes;
  const currentParticipation = currentTotal / maxVoteWeight;

  // Estimate additional votes that will arrive
  const estimatedNewVotes = Math.min(
    estimatedAdditionalVoters * avgAdditionalVoterWeight,
    maxVoteWeight - currentTotal
  );
  // pessimisticAssumption: fraction of new voters we expect to vote NO (against us)
  // 0 = optimistic (all new voters vote YES)
  // 1 = pessimistic (all new voters vote NO)
  const pessimisticNewNo = estimatedNewVotes * pessimisticAssumption;
  const pessimisticNewYes = estimatedNewVotes * (1 - pessimisticAssumption);

  const finalYes = yesVotes + pessimisticNewYes;
  const finalNo = noVotes + pessimisticNewNo;
  const finalTotal = finalYes + finalNo + abstainVotes;

  const finalYesShare = finalTotal > 0 ? finalYes / finalTotal : 0;
  const finalNoShare = finalTotal > 0 ? finalNo / finalTotal : 0;
  const finalParticipation = finalTotal / maxVoteWeight;

  const quorumMet = finalParticipation >= QUORUM_THRESHOLD;
  const passes = quorumMet && finalYes > finalNo;

  return {
    currentYes: yesVotes,
    currentNo: noVotes,
    currentParticipation,
    estimatedFinalYes: finalYes,
    estimatedFinalNo: finalNo,
    estimatedFinalYesShare: finalYesShare,
    estimatedFinalNoShare: finalNoShare,
    estimatedFinalParticipation: finalParticipation,
    quorumMet,
    passes,
    recommendation: passes ? 'PASSING' : (finalYes > finalNo ? 'LEAN_PASS' : 'AT_RISK'),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Example: 70% quorum currently, 24 hours left, 100 more voters expected
  const result = simulateVoteOutcome({
    yesVotes: 350,
    noVotes: 100,
    maxVoteWeight: 1000,
    remainingSeconds: 86400,
    estimatedAdditionalVoters: 100,
    avgAdditionalVoterWeight: 5,
  });
  console.log('Simulation result:');
  console.log(`  Current participation: ${(result.currentParticipation * 100).toFixed(1)}%`);
  console.log(`  Estimated final YES: ${(result.estimatedFinalYesShare * 100).toFixed(1)}%`);
  console.log(`  Quorum met: ${result.quorumMet}`);
  console.log(`  Passes: ${result.passes}`);
  console.log(`  Recommendation: ${result.recommendation}`);
}