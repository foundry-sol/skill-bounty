#!/usr/bin/env node
/**
 * portfolio_tracker.mjs — Track NFT portfolio value + P&L across multiple wallets.
 *
 * Maintains a local JSON store of:
 *   - Holdings per wallet
 *   - Cost basis (when available)
 *   - Current floor prices
 *   - P&L calculations
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATH = path.join(process.env.HOME || '/tmp', '.foundry', 'nft-portfolio.json');

export class NFTPortfolio {
  constructor(storePath = DEFAULT_PATH) {
    this.path = storePath;
    this._ensureDir();
    this.data = this._load();
  }

  _ensureDir() {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _load() {
    if (!fs.existsSync(this.path)) {
      return { holdings: {}, costBasis: {}, lastValuation: null, lastValuationAt: null };
    }
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {
      return { holdings: {}, costBasis: {}, lastValuation: null, lastValuationAt: null };
    }
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  /**
   * Add or replace holdings for a wallet.
   * @param {string} wallet - Wallet address
   * @param {Array} nfts - Array of { mint, name, collection, attributes, ... }
   */
  setHoldings(wallet, nfts) {
    this.data.holdings[wallet] = {
      count: nfts.length,
      nfts,
      updatedAt: Date.now(),
    };
    this._save();
  }

  /**
   * Add cost basis for an NFT.
   */
  setCostBasis(mint, pricePaid, acquisitionDate = null) {
    this.data.costBasis[mint] = {
      pricePaid,
      acquisitionDate: acquisitionDate || Date.now(),
    };
    this._save();
  }

  /**
   * Calculate portfolio value with current floor prices.
   * @param {Function} priceResolver - async (nft) => floorPrice in SOL
   */
  async valuation(priceResolver) {
    const result = {
      wallets: [],
      totalValueSol: 0,
      totalNfts: 0,
      perWallet: {},
      breakdown: {
        valued: 0,
        unvalued: 0,
        undervalued: 0,  // floor < cost basis
      },
      timestamp: Date.now(),
    };

    for (const [wallet, holding] of Object.entries(this.data.holdings)) {
      const walletVal = {
        wallet,
        count: holding.count,
        valueSol: 0,
        valuedNfts: 0,
        unvaluedNfts: 0,
        nfts: [],
      };

      for (const nft of holding.nfts) {
        const floorPrice = await priceResolver(nft);
        if (floorPrice > 0) {
          walletVal.valueSol += floorPrice;
          walletVal.valuedNfts++;
          result.breakdown.valued++;
        } else {
          walletVal.unvaluedNfts++;
          result.breakdown.unvalued++;
        }

        const costEntry = this.data.costBasis[nft.mint];
        const pnl = costEntry ? floorPrice - costEntry.pricePaid : null;
        const pnlPct = costEntry ? (pnl / costEntry.pricePaid) * 100 : null;

        walletVal.nfts.push({
          mint: nft.mint,
          name: nft.name,
          collection: nft.collection,
          floorPrice,
          costBasis: costEntry?.pricePaid || null,
          pnl,
          pnlPct,
        });
      }

      result.wallets.push(walletVal);
      result.perWallet[wallet] = walletVal;
      result.totalValueSol += walletVal.valueSol;
      result.totalNfts += walletVal.count;
    }

    // Calculate totals
    const totalCostBasis = Object.values(this.data.costBasis)
      .reduce((s, c) => s + c.pricePaid, 0);
    result.totalCostBasisSol = totalCostBasis;
    result.totalPnlSol = result.totalValueSol - totalCostBasis;
    result.totalPnlPct = totalCostBasis > 0 ? (result.totalPnlSol / totalCostBasis) * 100 : null;

    this.data.lastValuation = result;
    this.data.lastValuationAt = result.timestamp;
    this._save();

    return result;
  }

  getLastValuation() {
    return this.data.lastValuation;
  }

  /**
   * Aggregate across all wallets.
   */
  summary() {
    const last = this.data.lastValuation;
    if (!last) {
      return {
        totalNfts: Object.values(this.data.holdings).reduce((s, h) => s + h.count, 0),
        lastValuationAt: null,
      };
    }
    return {
      totalValueSol: last.totalValueSol,
      totalNfts: last.totalNfts,
      totalPnlSol: last.totalPnlSol,
      totalPnlPct: last.totalPnlPct,
      lastValuationAt: last.timestamp,
      walletCount: last.wallets.length,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo
  const portfolio = new NFTPortfolio('/tmp/nft-portfolio-demo.json');

  portfolio.setHoldings('wallet-1', [
    { mint: 'abc', name: 'Mad Lads #1', collection: 'mad_lads' },
    { mint: 'def', name: 'Mad Lads #2', collection: 'mad_lads' },
    { mint: 'ghi', name: 'Tensorian #1', collection: 'tensorians' },
  ]);
  portfolio.setCostBasis('abc', 50);
  portfolio.setCostBasis('def', 60);

  // Mock price resolver
  const valuation = await portfolio.valuation(async (nft) => {
    const prices = { mad_lads: 45, tensorians: 5 };
    return prices[nft.collection] || 0;
  });

  console.log('Valuation:');
  console.log(`  Total NFTs: ${valuation.totalNfts}`);
  console.log(`  Total value: ${valuation.totalValueSol} SOL`);
  console.log(`  Total P&L: ${valuation.totalPnlSol} SOL (${valuation.totalPnlPct?.toFixed(1)}%)`);
}