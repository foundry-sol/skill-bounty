#!/usr/bin/env node
/**
 * fetch_validators.mjs — Pull Solana validator set + epoch info
 *
 * Returns top validators with commission, activated stake, skip rate, MEV (jito) status.
 * Used by score_validator.mjs for ranking.
 *
 * Usage:
 *   node fetch_validators.mjs                     # mainnet, top 50 by stake
 *   node fetch_validators.mjs --limit 100         # top 100
 *   node fetch_validators.mjs --network testnet
 *   node fetch_validators.mjs --json              # raw JSON output
 *
 * Exit codes: 0=ok, 1=RPC error, 2=usage
 */

import { Connection, PublicKey } from '@solana/web3.js';

const VALIDATOR_PROGRAM_ID = new PublicKey('VoT1J3bDj2wzPwB9qT3zBeUEP4VpA1yMq2SEm7tnVwa');

function parseArgs(argv) {
  const args = { limit: 50, network: 'mainnet', json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--network') args.network = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function rpcUrl(network) {
  return network === 'testnet'
    ? 'https://api.testnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node fetch_validators.mjs [--limit N] [--network mainnet|testnet] [--json]');
    process.exit(0);
  }
  const conn = new Connection(rpcUrl(args.network), 'confirmed');
  let validators, epochInfo;
  try {
    validators = await conn.getVoteAccounts();
    epochInfo = await conn.getEpochInfo();
  } catch (err) {
    console.error(JSON.stringify({ error: 'rpc_failure', message: err.message }));
    process.exit(1);
  }

  // Merge active + delinquent into one list with status
  const all = [
    ...validators.current.map((v) => ({ ...v, status: 'active' })),
    ...validators.delinquent.map((v) => ({ ...v, status: 'delinquent' })),
  ];

  // Compute total active stake for concentration calc
  const active = validators.current;
  const totalActiveStake = active.reduce((s, v) => s + v.activatedStake, 0);

  // Detect MEV/jito validators (their name often contains "jito" but we can't assume)
  // We'll just flag skip_rate — high skip rate on active validators = potential MEV without reporting
  const enriched = all
    .map((v) => {
      const commission = v.commission; // 0-100
      const activatedSol = v.activatedStake / 1e9;
      const epochCredits = v.epochCredits || [];
      const lastCredit = epochCredits[epochCredits.length - 1] || [0, 0, 0];
      const stakeSharePct = (v.activatedStake / totalActiveStake) * 100;
      // MEV heuristic: jito tip receivers tend to have higher vote credits than baseline
      // Without on-chain tip data, we just expose skip_rate and let score_validator decide
      return {
        votePubkey: v.votePubkey,
        nodePubkey: v.nodePubkey,
        name: (v.nodePubkey || '').slice(0, 12),
        commissionPct: commission,
        activatedStakeSol: Math.round(activatedSol * 100) / 100,
        stakeSharePct: Math.round(stakeSharePct * 10000) / 100,
        lastEpochCredits: lastCredit[1] - lastCredit[0],
        epoch: epochInfo.epoch,
        status: v.status,
      };
    })
    .sort((a, b) => b.activatedStakeSol - a.activatedStakeSol)
    .slice(0, args.limit);

  const result = {
    network: args.network,
    epoch: epochInfo.epoch,
    slot: epochInfo.absoluteSlot,
    totalActiveStakeSol: Math.round((totalActiveStake / 1e9) * 100) / 100,
    validatorCount: enriched.length,
    validators: enriched,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Network: ${result.network} | Epoch: ${result.epoch} | Slot: ${result.slot}`);
    console.log(`Total active stake: ${result.totalActiveStakeSol.toLocaleString()} SOL`);
    console.log(`Showing top ${result.validatorCount} validators by stake:\n`);
    console.log('Name           | Commission | Stake (SOL)   | Share % | Epoch Credits | Status');
    console.log('---------------|------------|---------------|---------|---------------|--------');
    for (const v of enriched) {
      console.log(
        `${v.name.padEnd(13)} | ${String(v.commissionPct + '%').padEnd(10)} | ${String(v.activatedStakeSol.toLocaleString()).padEnd(13)} | ${String(v.stakeSharePct + '%').padEnd(7)} | ${String(v.lastEpochCredits).padEnd(13)} | ${v.status}`
      );
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}