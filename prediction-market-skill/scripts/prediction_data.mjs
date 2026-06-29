#!/usr/bin/env node
/**
 * prediction_data.mjs — Fetch prediction market data from multiple sources.
 *
 * Supports:
 *   - Polymarket (EVM CLOB via public API)
 *   - Drift Protocol (Solana prediction markets via public API)
 *   - Kalshi (US-regulated, public API)
 *
 * Returns normalized market data so agents can reason across platforms.
 */

/**
 * Polymarket data — uses the public Gamma API
 * https://gamma-api.polymarket.com/markets
 */
export async function fetchPolymarketMarkets(options = {}) {
  const { limit = 50, active = true } = options;
  const url = `https://gamma-api.polymarket.com/markets?active=${active}&closed=false&limit=${limit}`;
  return await fetchJson(url, 'Polymarket');
}

/**
 * Drift Protocol — Solana prediction markets
 * https://beta.drift.trade/api/markets
 */
export async function fetchDriftMarkets() {
  const url = 'https://beta.drift.trade/api/markets';
  return await fetchJson(url, 'Drift');
}

/**
 * Kalshi — US-regulated prediction markets
 * https://api.elections.kalshi.com/trade-api/v2/markets
 */
export async function fetchKalshiMarkets(options = {}) {
  const { limit = 50, status = 'open' } = options;
  const url = `https://api.elections.kalshi.com/trade-api/v2/markets?limit=${limit}&status=${status}`;
  return await fetchJson(url, 'Kalshi');
}

/**
 * Aggregate markets from all sources.
 * Returns a normalized shape: { source, id, question, yesPrice, noPrice, volume, endDate, url }
 */
export async function fetchAllMarkets(options = {}) {
  const results = await Promise.allSettled([
    fetchPolymarketMarkets(options),
    fetchDriftMarkets(),
    fetchKalshiMarkets(options),
  ]);
  const all = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  }
  return all;
}

async function fetchJson(url, source) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Foundry-Agent)',
    'Accept': 'application/json',
  };
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error(`${source} API returned ${response.status}`);
    }
    const data = await response.json();
    return normalizeMarkets(data, source);
  } catch (err) {
    // Don't crash the whole fetch if one source is down
    return [];
  }
}

/**
 * Normalize different API shapes to a common format.
 */
export function normalizeMarkets(rawData, source) {
  if (source === 'Polymarket') {
    if (!Array.isArray(rawData)) return [];
    return rawData.map(m => ({
      source: 'polymarket',
      id: m.conditionId || m.id,
      question: m.question || m.title || '',
      yesPrice: parseFloat(m.outcomePrices?.[0] || m.bestBid || 0),
      noPrice: parseFloat(m.outcomePrices?.[1] || 1 - (parseFloat(m.outcomePrices?.[0] || 0))),
      volume: parseFloat(m.volumeNum || m.volume || 0),
      endDate: m.endDate,
      url: `https://polymarket.com/event/${m.slug || m.id}`,
      category: m.category,
      liquidity: parseFloat(m.liquidity || m.liquidityNum || 0),
    })).filter(m => m.question && m.yesPrice > 0);
  }

  if (source === 'Drift') {
    if (!rawData || !rawData.markets) return [];
    return rawData.markets.map(m => ({
      source: 'drift',
      id: m.marketIndex?.toString() || m.symbol,
      question: m.name || m.symbol,
      yesPrice: 0, // Drift doesn't use YES/NO model
      noPrice: 0,
      volume: parseFloat(m.volume24h || 0),
      endDate: m.expiryTs ? new Date(m.expiryTs * 1000).toISOString() : null,
      url: 'https://beta.drift.trade/markets',
      category: m.category,
      liquidity: parseFloat(m.openInterest || 0),
      isPerp: true,
    })).filter(m => m.question);
  }

  if (source === 'Kalshi') {
    if (!rawData || !rawData.markets) return [];
    return rawData.markets.map(m => ({
      source: 'kalshi',
      id: m.ticker,
      question: m.title || m.subtitle || m.ticker,
      yesPrice: (m.yes_ask || 0) / 100, // Kalshi uses cents
      noPrice: (m.no_ask || 0) / 100,
      volume: parseFloat(m.volume || 0),
      endDate: m.expiration_time,
      url: `https://kalshi.com/markets/${m.ticker}`,
      category: m.category,
      liquidity: parseFloat(m.open_interest || 0),
    })).filter(m => m.question && m.yesPrice > 0);
  }

  return [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo
  const markets = await fetchAllMarkets();
  console.log(`Found ${markets.length} markets across all sources:`);
  for (const m of markets.slice(0, 5)) {
    console.log(`  [${m.source}] ${m.question.slice(0, 80)} | YES: ${(m.yesPrice * 100).toFixed(1)}% | Vol: $${m.volume.toFixed(0)}`);
  }
}