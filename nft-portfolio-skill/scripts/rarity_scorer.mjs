#!/usr/bin/env node
/**
 * rarity_scorer.mjs — Basic NFT rarity scoring from trait data.
 *
 * For each NFT, calculate:
 *   - Trait rarity score (rarity = 1 / (count / total_supply))
 *   - Statistical rarity (sum of ln(rarity) for all traits)
 *   - Rank within collection
 *
 * Inputs:
 *   - nfts: array of { mint, name, attributes: [{trait_type, value}] }
 *   - collection: shared collection metadata
 */

const RARITY_METHODS = {
  STANDARD: 'standard',      // 1 / frequency
  STATISTICAL: 'statistical', // sum of -ln(frequency)
  WEIGHTED: 'weighted',      // 1 / (frequency^2)
};

export function buildTraitIndex(nfts) {
  const index = {};
  for (const nft of nfts) {
    for (const attr of nft.attributes || []) {
      const type = attr.trait_type || attr.key;
      const value = attr.value;
      if (!type || value === undefined || value === null) continue;
      if (!index[type]) index[type] = {};
      if (!index[type][value]) index[type][value] = 0;
      index[type][value]++;
    }
  }
  return index;
}

export function scoreRarity(nft, traitIndex, totalSupply) {
  if (!nft.attributes || nft.attributes.length === 0) return { score: 0, rank: 0 };
  let score = 0;
  const traitScores = [];

  for (const attr of nft.attributes) {
    const type = attr.trait_type || attr.key;
    const value = attr.value;
    if (!type || value === undefined || value === null) continue;

    const count = traitIndex[type]?.[value] || 0;
    if (count === 0) continue;

    // Standard rarity: 1 / (count / total)
    const frequency = count / totalSupply;
    const rarityScore = 1 / frequency;
    traitScores.push({ type, value, count, rarityScore });
    score += rarityScore;
  }

  return { score, traitScores };
}

export function scoreRarityStatistical(nft, traitIndex, totalSupply) {
  if (!nft.attributes || nft.attributes.length === 0) return { score: 0 };
  let score = 0;
  for (const attr of nft.attributes) {
    const type = attr.trait_type || attr.key;
    const value = attr.value;
    if (!type || value === undefined || value === null) continue;

    const count = traitIndex[type]?.[value] || 0;
    if (count === 0) continue;
    const frequency = count / totalSupply;
    // Statistical rarity: -ln(frequency) * -1 = ln(1/frequency)
    // Higher = rarer
    score += -Math.log(frequency);
  }
  return { score };
}

export function rankRarities(nfts, method = RARITY_METHODS.STANDARD) {
  if (nfts.length === 0) return [];
  const traitIndex = buildTraitIndex(nfts);
  const totalSupply = nfts.length;

  const scored = nfts.map(nft => {
    const result = method === RARITY_METHODS.STATISTICAL
      ? scoreRarityStatistical(nft, traitIndex, totalSupply)
      : scoreRarity(nft, traitIndex, totalSupply);
    return { ...nft, rarityScore: result.score, traitScores: result.traitScores };
  });

  // Sort by rarity descending, assign ranks
  scored.sort((a, b) => b.rarityScore - a.rarityScore);
  return scored.map((nft, i) => ({ ...nft, rarityRank: i + 1 }));
}

export function findOutliers(nfts, method = RARITY_METHODS.STATISTICAL) {
  const ranked = rankRarities(nfts, method);
  if (ranked.length === 0) return [];

  const scores = ranked.map(n => n.rarityScore);
  const mean = scores.reduce((s, n) => s + n, 0) / scores.length;
  const std = Math.sqrt(
    scores.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / scores.length
  );

  return ranked.filter(n => n.rarityScore > mean + 2 * std);
}

export { RARITY_METHODS };

if (import.meta.url === `file://${process.argv[1]}`) {
  const nfts = [
    {
      mint: '1', name: 'NFT 1', attributes: [
        { trait_type: 'Background', value: 'Blue' },
        { trait_type: 'Fur', value: 'Gold' },
      ],
    },
    {
      mint: '2', name: 'NFT 2', attributes: [
        { trait_type: 'Background', value: 'Blue' },
        { trait_type: 'Fur', value: 'Brown' },
      ],
    },
    {
      mint: '3', name: 'NFT 3', attributes: [
        { trait_type: 'Background', value: 'Red' },
        { trait_type: 'Fur', value: 'Brown' },
      ],
    },
    {
      mint: '4', name: 'NFT 4', attributes: [
        { trait_type: 'Background', value: 'Red' },
        { trait_type: 'Fur', value: 'Pink' }, // 1/4 = rare
      ],
    },
  ];
  const ranked = rankRarities(nfts, RARITY_METHODS.STANDARD);
  console.log('Rarity ranking:');
  for (const nft of ranked) {
    console.log(`  #${nft.rarityRank} ${nft.name} score=${nft.rarityScore.toFixed(2)}`);
  }
}