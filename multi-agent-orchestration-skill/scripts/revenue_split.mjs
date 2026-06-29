#!/usr/bin/env node
/**
 * Economic split strategies for multi-agent revenue sharing.
 *
 * When multiple agents collaborate on a task that produces revenue, this
 * module calculates how to split the payout fairly. Strategies:
 *   - equal: split equally regardless of contribution
 *   - contribution: weighted by measurable contribution
 *   - stake: weighted by staked capital
 *   - reputation: weighted by track record
 */
export const STRATEGIES = {
  EQUAL: 'equal',
  CONTRIBUTION: 'contribution',
  STAKE: 'stake',
  REPUTATION: 'reputation',
};

export class RevenueSplitter {
  constructor(strategy = STRATEGIES.EQUAL) {
    this.strategy = strategy;
  }

  /**
   * Calculate payout per agent.
   * @param {number} totalAmount - Total revenue to split (e.g. in USDG, USDC, lamports)
   * @param {Array<{agentId: string, contribution?: number, stake?: number, reputation?: number}>} agents
   * @returns {Array<{agentId: string, amount: number, share: number}>}
   */
  split(totalAmount, agents) {
    if (!agents || agents.length === 0) {
      throw new Error('No agents to split between');
    }

    const weights = this.weights(agents);
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    if (totalWeight === 0) {
      // Fallback to equal split
      const each = totalAmount / agents.length;
      return agents.map(a => ({ agentId: a.agentId, amount: each, share: 1 / agents.length }));
    }

    return agents.map((a, i) => ({
      agentId: a.agentId,
      amount: Math.floor((totalAmount * weights[i]) / totalWeight),
      share: weights[i] / totalWeight,
    }));
  }

  weights(agents) {
    switch (this.strategy) {
      case STRATEGIES.EQUAL:
        return agents.map(() => 1);
      case STRATEGIES.CONTRIBUTION:
        return agents.map(a => a.contribution || 0);
      case STRATEGIES.STAKE:
        return agents.map(a => a.stake || 0);
      case STRATEGIES.REPUTATION:
        return agents.map(a => a.reputation || 1);
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`);
    }
  }

  /**
   * Validate that splits sum to total (within rounding).
   */
  validate(payouts, totalAmount) {
    const sum = payouts.reduce((s, p) => s + p.amount, 0);
    return {
      ok: sum <= totalAmount,
      totalAllocated: sum,
      remainder: totalAmount - sum,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const splitter = new RevenueSplitter(STRATEGIES.CONTRIBUTION);
  const payouts = splitter.split(1000, [
    { agentId: 'trader', contribution: 70 },
    { agentId: 'auditor', contribution: 20 },
    { agentId: 'scout', contribution: 10 },
  ]);
  console.log('Payouts:', payouts);
  console.log('Validation:', splitter.validate(payouts, 1000));
}