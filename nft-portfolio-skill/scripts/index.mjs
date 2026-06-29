#!/usr/bin/env node
/**
 * NFT portfolio CLI for Solana agents.
 *
 * Usage:
 *   solana-nft-portfolio fetch <wallet>
 *   solana-nft-portfolio value <wallet>
 *   solana-nft-portfolio rarity <collection-file>
 *   solana-nft-portfolio demo
 */

import { fetchWalletNFTs, fetchMagicEdenFloorPrice } from './nft_fetcher.mjs';
import { NFTPortfolio } from './portfolio_tracker.mjs';
import { rankRarities, RARITY_METHODS } from './rarity_scorer.mjs';

const HELP = `
solana-nft-portfolio — NFT portfolio toolkit for Solana agents

Commands:
  fetch     Fetch all NFTs owned by a wallet
  value     Calculate portfolio value (uses Magic Eden floor prices)
  rarity    Rank NFTs by rarity from a JSON file
  demo      Run a complete demo

Examples:
  solana-nft-portfolio fetch <wallet-address>
  solana-nft-portfolio value <wallet-address>
  solana-nft-portfolio rarity nfts.json
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  if (cmd === 'demo') return runDemo();
  if (cmd === 'fetch') return runFetch(args);
  if (cmd === 'value') return runValue(args);
  if (cmd === 'rarity') return runRarity(args);
  console.log(`Unknown command: ${cmd}\n${HELP}`);
}

async function runFetch(args) {
  const wallet = args[0];
  if (!wallet) {
    console.log('Need a wallet address');
    return;
  }
  console.log(`Fetching NFTs for ${wallet}...`);
  const nfts = await fetchWalletNFTs(wallet);
  console.log(`Found ${nfts.length} NFTs:`);
  for (const nft of nfts.slice(0, 20)) {
    console.log(`  ${nft.name} (${nft.collection || 'no collection'})`);
  }
}

async function runValue(args) {
  const wallet = args[0];
  if (!wallet) {
    console.log('Need a wallet address');
    return;
  }

  const portfolio = new NFTPortfolio();
  const nfts = await fetchWalletNFTs(wallet);
  portfolio.setHoldings(wallet, nfts);

  console.log('Fetching floor prices...');
  const valuation = await portfolio.valuation(async (nft) => {
    if (!nft.collection) return 0;
    const stats = await fetchMagicEdenFloorPrice(nft.collection);
    return stats?.floorPrice || 0;
  });

  console.log(`\nValuation:`);
  console.log(`  Total NFTs: ${valuation.totalNfts}`);
  console.log(`  Valued: ${valuation.breakdown.valued}`);
  console.log(`  Unvalued: ${valuation.breakdown.unvalued}`);
  console.log(`  Total value: ${valuation.totalValueSol.toFixed(2)} SOL`);
  if (valuation.totalPnlSol !== undefined) {
    console.log(`  Total P&L: ${valuation.totalPnlSol.toFixed(2)} SOL (${valuation.totalPnlPct?.toFixed(1) ?? 'n/a'}%)`);
  }
}

function runRarity(args) {
  const file = args[0];
  if (!file) {
    console.log('Need a path to a JSON file containing NFTs array');
    return;
  }
  const fs = require('node:fs');
  const nfts = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ranked = rankRarities(nfts, RARITY_METHODS.STATISTICAL);
  console.log(`Ranked ${ranked.length} NFTs by rarity:`);
  for (const nft of ranked.slice(0, 20)) {
    console.log(`  #${nft.rarityRank} ${nft.name} score=${nft.rarityScore.toFixed(2)}`);
  }
}

async function runDemo() {
  console.log('=== NFT Portfolio Demo ===\n');

  console.log('1. Setting up mock portfolio...\n');
  const portfolio = new NFTPortfolio('/tmp/nft-portfolio-demo.json');
  portfolio.setHoldings('demo-wallet', [
    { mint: 'mock1', name: 'Mad Lads #1', collection: 'mad_lads', attributes: [{trait_type: 'Background', value: 'Blue'}] },
    { mint: 'mock2', name: 'Mad Lads #2', collection: 'mad_lads', attributes: [{trait_type: 'Background', value: 'Red'}] },
    { mint: 'mock3', name: 'Tensorian #1', collection: 'tensorians', attributes: [{trait_type: 'Background', value: 'Gold'}] },
  ]);
  portfolio.setCostBasis('mock1', 50);
  portfolio.setCostBasis('mock2', 30);
  console.log('   3 NFTs with cost basis for 2\n');

  console.log('2. Computing valuation with mock floor prices...\n');
  const valuation = await portfolio.valuation(async (nft) => {
    return { mad_lads: 45, tensorians: 5 }[nft.collection] || 0;
  });
  console.log(`   Total value: ${valuation.totalValueSol} SOL`);
  console.log(`   Total cost basis: ${valuation.totalCostBasisSol} SOL`);
  console.log(`   P&L: ${valuation.totalPnlSol} SOL (${valuation.totalPnlPct?.toFixed(1)}%)\n`);

  console.log('3. Ranking by rarity...\n');
  const nfts = [
    { mint: 'a', name: 'NFT A', attributes: [{trait_type: 'Bg', value: 'common'}] },
    { mint: 'b', name: 'NFT B', attributes: [{trait_type: 'Bg', value: 'common'}] },
    { mint: 'c', name: 'NFT C', attributes: [{trait_type: 'Bg', value: 'common'}] },
    { mint: 'd', name: 'NFT D', attributes: [{trait_type: 'Bg', value: 'rare'}] },
  ];
  const ranked = rankRarities(nfts, RARITY_METHODS.STATISTICAL);
  for (const nft of ranked) {
    console.log(`   #${nft.rarityRank} ${nft.name} score=${nft.rarityScore.toFixed(2)}`);
  }
  console.log();
  console.log('=== Demo complete ===');
}

main();