// tests/nft-portfolio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTraitIndex, scoreRarity, scoreRarityStatistical, rankRarities, findOutliers, RARITY_METHODS } from '../scripts/rarity_scorer.mjs';
import { NFTPortfolio } from '../scripts/portfolio_tracker.mjs';

const EPS = 1e-9;
function assertApprox(actual, expected, eps = EPS, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg || ''} expected ${expected} ± ${eps}, got ${actual}`);
  }
}

// ============================================================
// rarity_scorer
// ============================================================

test('buildTraitIndex: counts trait values correctly', () => {
  const nfts = [
    { mint: '1', attributes: [{trait_type: 'Bg', value: 'Blue'}] },
    { mint: '2', attributes: [{trait_type: 'Bg', value: 'Blue'}] },
    { mint: '3', attributes: [{trait_type: 'Bg', value: 'Red'}] },
  ];
  const idx = buildTraitIndex(nfts);
  assert.equal(idx['Bg']['Blue'], 2);
  assert.equal(idx['Bg']['Red'], 1);
});

test('buildTraitIndex: skips empty attributes', () => {
  const nfts = [
    { mint: '1', attributes: [] },
    { mint: '2' },
    { mint: '3', attributes: [{trait_type: 'Bg', value: 'Blue'}] },
  ];
  const idx = buildTraitIndex(nfts);
  assert.equal(idx['Bg']['Blue'], 1);
});

test('scoreRarity: rarer traits score higher', () => {
  // Use a 100-NFT collection where rarity actually varies
  const nfts = [];
  for (let i = 0; i < 90; i++) {
    nfts.push({ mint: `common${i}`, attributes: [{trait_type: 'Bg', value: 'Common'}] });
  }
  for (let i = 0; i < 9; i++) {
    nfts.push({ mint: `uncommon${i}`, attributes: [{trait_type: 'Bg', value: 'Uncommon'}] });
  }
  nfts.push({ mint: 'rare', attributes: [{trait_type: 'Bg', value: 'Legendary'}] });
  const idx = buildTraitIndex(nfts);
  const commonScore = scoreRarity(nfts[0], idx, 100);
  const rareScore = scoreRarity(nfts[99], idx, 100);
  // Common: 1/(90/100) = 1.11
  // Legendary: 1/(1/100) = 100
  assert.ok(rareScore.score > commonScore.score * 10);
});

test('scoreRarityStatistical: uses log frequency', () => {
  const nfts = [
    { mint: 'a', attributes: [{trait_type: 'Bg', value: 'X'}] },
  ];
  const idx = buildTraitIndex(nfts);
  const score = scoreRarityStatistical(nfts[0], idx, 100);
  // -ln(1/100) = -ln(0.01) = ~4.605
  assertApprox(score.score, 4.605, 0.01);
});

test('rankRarities: ranks from rarest to most common', () => {
  const nfts = [
    { mint: '1', name: 'A', attributes: [{trait_type: 'Bg', value: 'Common'}] },
    { mint: '2', name: 'B', attributes: [{trait_type: 'Bg', value: 'Common'}] },
    { mint: '3', name: 'C', attributes: [{trait_type: 'Bg', value: 'Rare'}] },
  ];
  const ranked = rankRarities(nfts, RARITY_METHODS.STANDARD);
  assert.equal(ranked[0].mint, '3'); // Rare trait
  assert.equal(ranked[0].rarityRank, 1);
  // Common traits share rank by score, but order may vary
  assert.ok(ranked[1].rarityRank === 2 || ranked[2].rarityRank === 2);
});

test('rankRarities: empty array returns empty', () => {
  assert.deepEqual(rankRarities([]), []);
});

test('findOutliers: identifies statistically rare NFTs', () => {
  const nfts = [];
  // 9 common NFTs
  for (let i = 0; i < 9; i++) {
    nfts.push({ mint: `common${i}`, attributes: [{trait_type: 'Bg', value: 'Common'}] });
  }
  // 1 super-rare
  nfts.push({ mint: 'rare', attributes: [
    {trait_type: 'Bg', value: 'Gold'},
    {trait_type: 'Fur', value: 'Pink'},
    {trait_type: 'Hat', value: 'Halo'},
  ] });
  const outliers = findOutliers(nfts, RARITY_METHODS.STATISTICAL);
  assert.ok(outliers.length > 0);
  assert.equal(outliers[0].mint, 'rare');
});

// ============================================================
// NFTPortfolio
// ============================================================

test('NFTPortfolio: setHoldings and summary', () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('wallet-1', [
    { mint: 'a', name: 'A' },
    { mint: 'b', name: 'B' },
  ]);
  const s = p.summary();
  assert.equal(s.totalNfts, 2);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: valuation with cost basis', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('w1', [
    { mint: 'a', name: 'A', collection: 'coll' },
    { mint: 'b', name: 'B', collection: 'coll' },
  ]);
  p.setCostBasis('a', 100);
  p.setCostBasis('b', 50);

  const v = await p.valuation(async () => 75);
  // Value: 2 * 75 = 150, Cost: 100 + 50 = 150, P&L: 0
  assertApprox(v.totalValueSol, 150);
  assertApprox(v.totalCostBasisSol, 150);
  assertApprox(v.totalPnlSol, 0);
  assert.equal(v.breakdown.valued, 2);
  assert.equal(v.breakdown.unvalued, 0);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: unvalued NFTs handled', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('w1', [
    { mint: 'a', collection: 'coll1' },
    { mint: 'b', collection: 'coll2' },
  ]);
  const v = await p.valuation(async (nft) => nft.collection === 'coll1' ? 10 : 0);
  assert.equal(v.breakdown.valued, 1);
  assert.equal(v.breakdown.unvalued, 1);
  assertApprox(v.totalValueSol, 10);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: P&L positive when floor > cost', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('w1', [{ mint: 'a', collection: 'coll' }]);
  p.setCostBasis('a', 50);
  const v = await p.valuation(async () => 100);
  assertApprox(v.totalPnlSol, 50);
  assertApprox(v.totalPnlPct, 100);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: P&L negative when floor < cost', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('w1', [{ mint: 'a', collection: 'coll' }]);
  p.setCostBasis('a', 100);
  const v = await p.valuation(async () => 50);
  assertApprox(v.totalPnlSol, -50);
  assertApprox(v.totalPnlPct, -50);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: multiple wallets aggregated', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('w1', [{ mint: 'a', collection: 'coll' }]);
  p.setHoldings('w2', [{ mint: 'b', collection: 'coll' }]);
  p.setHoldings('w3', [{ mint: 'c', collection: 'coll' }]);
  const v = await p.valuation(async () => 10);
  assert.equal(v.totalNfts, 3);
  assert.equal(v.wallets.length, 3);
  assertApprox(v.totalValueSol, 30);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: P&L per NFT reported', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  p.setHoldings('w1', [
    { mint: 'a', collection: 'coll' },
    { mint: 'b', collection: 'coll' },
  ]);
  p.setCostBasis('a', 100); // cost basis 100
  p.setCostBasis('b', 50);  // cost basis 50
  // Floor at 75: a is down 25, b is up 25
  const v = await p.valuation(async () => 75);
  const a = v.perWallet['w1'].nfts.find(n => n.mint === 'a');
  const b = v.perWallet['w1'].nfts.find(n => n.mint === 'b');
  assertApprox(a.pnl, -25);
  assertApprox(b.pnl, 25);
  assertApprox(a.pnlPct, -25);
  assertApprox(b.pnlPct, 50);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: persists across instances', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p1 = new NFTPortfolio(tmp);
  p1.setHoldings('w1', [{ mint: 'a', collection: 'coll' }]);
  p1.setCostBasis('a', 50);
  await p1.valuation(async () => 100); // await!

  const p2 = new NFTPortfolio(tmp);
  const last = p2.getLastValuation();
  assert.ok(last);
  assert.equal(last.totalNfts, 1);
  fs.rmSync(tmp, { force: true });
});

test('NFTPortfolio: handles empty holdings gracefully', async () => {
  const tmp = path.join('/tmp', `nft-test-${Date.now()}-${Math.random()}.json`);
  const p = new NFTPortfolio(tmp);
  const v = await p.valuation(async () => 0);
  assert.equal(v.totalNfts, 0);
  assert.equal(v.totalValueSol, 0);
  assert.equal(v.totalCostBasisSol, 0);
  fs.rmSync(tmp, { force: true });
});