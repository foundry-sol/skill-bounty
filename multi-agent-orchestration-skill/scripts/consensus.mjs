#!/usr/bin/env node
/**
 * Consensus engine for multi-agent decisions.
 *
 * When multiple agents have different answers to the same question, this
 * module provides strategies for combining them. Useful for:
 *   - Multiple agents analyzing the same trade
 *   - Vulnerability validation across multiple scanners
 *   - Cross-checking security reports
 *
 * Strategies:
 *   - majority: >50% agreement required
 *   - unanimous: all must agree
 *   - weighted: trust scores weight each vote
 *   - first-valid: take first non-error result
 */
export const STRATEGIES = {
  MAJORITY: 'majority',
  UNANIMOUS: 'unanimous',
  WEIGHTED: 'weighted',
  FIRST_VALID: 'first-valid',
};

export class ConsensusEngine {
  constructor(strategy = STRATEGIES.MAJORITY) {
    this.strategy = strategy;
  }

  /**
   * Collect votes from multiple agents and return the consensus answer.
   * @param {Array<{agentId: string, result: any, weight?: number}>} votes
   * @returns {{ answer: any, confidence: number, dissents: string[] }}
   */
  resolve(votes) {
    if (!votes || votes.length === 0) {
      throw new Error('No votes to resolve');
    }

    // Filter out error votes
    const valid = votes.filter(v => v.result !== null && v.result !== undefined && !v.result?.error);

    if (valid.length === 0) {
      return { answer: null, confidence: 0, dissents: votes.map(v => v.agentId) };
    }

    switch (this.strategy) {
      case STRATEGIES.MAJORITY:
        return this.majority(valid, votes);
      case STRATEGIES.UNANIMOUS:
        return this.unanimous(valid, votes);
      case STRATEGIES.WEIGHTED:
        return this.weighted(valid);
      case STRATEGIES.FIRST_VALID:
        return this.firstValid(valid);
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`);
    }
  }

  /**
   * Majority vote: group by result, pick group with >50% of valid votes.
   */
  majority(valid, all) {
    const counts = new Map();
    for (const v of valid) {
      const key = JSON.stringify(v.result);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    let bestKey = null;
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }

    const confidence = bestCount / valid.length;
    if (confidence <= 0.5) {
      return { answer: null, confidence, dissents: all.map(v => v.agentId) };
    }

    const dissents = valid
      .filter(v => JSON.stringify(v.result) !== bestKey)
      .map(v => v.agentId);

    return {
      answer: JSON.parse(bestKey),
      confidence,
      dissents,
    };
  }

  unanimous(valid) {
    const first = JSON.stringify(valid[0].result);
    const allAgree = valid.every(v => JSON.stringify(v.result) === first);
    if (!allAgree) {
      return { answer: null, confidence: 0, dissents: valid.map(v => v.agentId) };
    }
    return { answer: valid[0].result, confidence: 1, dissents: [] };
  }

  /**
   * Weighted: each agent has a weight (default 1). Sum weights by result,
   * pick the group with highest total weight.
   */
  weighted(valid) {
    const weights = new Map();
    let totalWeight = 0;
    for (const v of valid) {
      const key = JSON.stringify(v.result);
      const w = v.weight || 1;
      weights.set(key, (weights.get(key) || 0) + w);
      totalWeight += w;
    }

    let bestKey = null;
    let bestWeight = 0;
    for (const [key, w] of weights) {
      if (w > bestWeight) {
        bestKey = key;
        bestWeight = w;
      }
    }

    const dissents = valid
      .filter(v => JSON.stringify(v.result) !== bestKey)
      .map(v => v.agentId);

    return {
      answer: JSON.parse(bestKey),
      confidence: bestWeight / totalWeight,
      dissents,
    };
  }

  /**
   * First valid: take the first non-error result. Useful for fast iteration
   * when you have a primary agent and backups.
   */
  firstValid(valid) {
    return {
      answer: valid[0].result,
      confidence: 1 / valid.length,
      dissents: valid.slice(1).map(v => v.agentId),
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const engine = new ConsensusEngine(STRATEGIES.MAJORITY);
  const result = engine.resolve([
    { agentId: 'trader-a', result: { action: 'BUY', token: 'SOL' } },
    { agentId: 'trader-b', result: { action: 'BUY', token: 'SOL' } },
    { agentId: 'trader-c', result: { action: 'SELL', token: 'SOL' } },
  ]);
  console.log('Consensus:', result);
}