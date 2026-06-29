#!/usr/bin/env node
/**
 * proposal_tracker.mjs — Track Solana DAO governance proposals.
 *
 * Realms (SPL Governance) data model:
 *   - Realm: top-level DAO
 *   - Governance: per-realm config
 *   - Proposal: specific proposal to vote on
 *   - TokenOwnerRecord: voting power per wallet
 *
 * This module provides:
 *   - Realms API client (https://api.realms.today)
 *   - Proposal state machine
 *   - Vote tallying helpers
 *   - Alert rule evaluation
 */

const REALMS_API = 'https://api.realms.today/v2';
const TIMEOUT_MS = 15000;

/**
 * Fetch all realms (DAOs) tracked by Realms.
 */
export async function fetchAllRealms(options = {}) {
  const { limit = 100 } = options;
  return await fetchJson(`${REALMS_API}/realms?limit=${limit}`, 'realms');
}

/**
 * Fetch proposals for a specific realm.
 * @param {string} realmId - Realm public key (or symbol)
 */
export async function fetchProposals(realmId, options = {}) {
  const { state = 'Voting', limit = 50 } = options;
  return await fetchJson(
    `${REALMS_API}/realms/${realmId}/proposals?state=${state}&limit=${limit}`,
    'proposals'
  );
}

/**
 * Normalize proposal data into a common shape.
 */
export function normalizeProposal(raw) {
  return {
    id: raw.pubkey || raw.id,
    realmId: raw.realmId,
    name: raw.name,
    descriptionLink: raw.descriptionLink,
    state: raw.state, // Draft, SigningOff, Voting, Succeeded, Executed, Rejected, Cancelled, Defeated, Executing
    yesVotes: parseFloat(raw.yesVotes || raw.yesVoteCount || 0),
    noVotes: parseFloat(raw.noVotes || raw.noVoteCount || 0),
    abstainVotes: parseFloat(raw.abstainVotes || 0),
    maxVoteWeight: parseFloat(raw.maxVoteWeight || 0),
    governanceAddress: raw.governanceAddress,
    startVoteTs: raw.startVoteTs ? parseInt(raw.startVoteTs) : null,
    endVoteTs: raw.endVoteTs ? parseInt(raw.endVoteTs) : null,
    draftAt: raw.draftAt,
    votingAt: raw.votingAt,
    closedAt: raw.closedAt,
    executingAt: raw.executingAt,
    queuedAt: raw.queuedAt,
    executing: raw.executing,
    rejected: raw.rejected,
    transactionsCount: parseInt(raw.transactionsCount || 0),
  };
}

/**
 * Determine proposal state from normalized data.
 */
export function getProposalState(proposal) {
  if (proposal.executed) return 'Executed';
  if (proposal.rejected) return 'Rejected';
  if (proposal.state) return proposal.state;
  if (proposal.votingAt && !proposal.closedAt) return 'Voting';
  if (proposal.draftAt && !proposal.votingAt) return 'Draft';
  return 'Unknown';
}

/**
 * Calculate voting percentages.
 */
export function voteBreakdown(proposal) {
  const total = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
  if (total === 0) {
    return { total: 0, yesPct: 0, noPct: 0, abstainPct: 0, quorumMet: false, passed: null };
  }
  const yesPct = (proposal.yesVotes / total) * 100;
  const noPct = (proposal.noVotes / total) * 100;
  const abstainPct = (proposal.abstainVotes / total) * 100;
  // Simplified quorum: yes + no must exceed 50% (most DAOs)
  const quorumMet = (proposal.yesVotes + proposal.noVotes) / proposal.maxVoteWeight > 0.5;
  const passed = proposal.executed || (proposal.state === 'Succeeded');
  return { total, yesPct, noPct, abstainPct, quorumMet, passed };
}

/**
 * Calculate time remaining until vote ends.
 */
export function timeRemaining(proposal, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!proposal.endVoteTs) return null;
  const remaining = proposal.endVoteTs - nowSeconds;
  if (remaining < 0) return { remaining: 0, hoursRemaining: 0, ended: true };
  return {
    remaining,
    hoursRemaining: Math.floor(remaining / 3600),
    daysRemaining: Math.floor(remaining / 86400),
    ended: false,
  };
}

/**
 * Evaluate alert rules against a proposal.
 * @param {Object} proposal - Normalized proposal
 * @param {Object} rules - Alert rules
 * @returns {Array} List of triggered alerts
 */
export function evaluateAlerts(proposal, rules) {
  const alerts = [];
  const state = getProposalState(proposal);
  const breakdown = voteBreakdown(proposal);
  const remaining = timeRemaining(proposal);

  // State alerts
  if (rules.states?.includes(state)) {
    alerts.push({
      type: 'state',
      severity: 'info',
      message: `Proposal "${proposal.name}" is now in state: ${state}`,
      proposal,
    });
  }

  // Deadline alerts
  if (remaining && !remaining.ended) {
    if (rules.deadlineHours && remaining.hoursRemaining <= rules.deadlineHours) {
      alerts.push({
        type: 'deadline',
        severity: remaining.hoursRemaining < 24 ? 'high' : 'medium',
        message: `Proposal "${proposal.name}" voting ends in ${remaining.hoursRemaining}h`,
        proposal,
      });
    }
  }

  // Quorum alerts
  if (rules.quorumThreshold && breakdown.quorumMet) {
    alerts.push({
      type: 'quorum',
      severity: 'info',
      message: `Proposal "${proposal.name}" reached quorum`,
      proposal,
    });
  }

  // Vote swing alerts
  if (rules.voteSwingThreshold && breakdown.yesPct >= rules.voteSwingThreshold) {
    alerts.push({
      type: 'passing',
      severity: 'info',
      message: `Proposal "${proposal.name}" passing with ${breakdown.yesPct.toFixed(1)}% yes`,
      proposal,
    });
  }

  return alerts;
}

async function fetchJson(url, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Foundry-Agent)', Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${label} API returned ${response.status}`);
    return await response.json();
  } catch (err) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const proposals = await fetchProposals('MNGO');
  console.log(`Found ${proposals.length} proposals`);
}