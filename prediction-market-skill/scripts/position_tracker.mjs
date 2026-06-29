#!/usr/bin/env node
/**
 * position_tracker.mjs — Track open positions across prediction market platforms.
 *
 * Maintains a local JSON store of:
 *   - Open positions (platform, market_id, side, size, entry_price)
 *   - Closed positions (P&L)
 *   - Portfolio aggregate (total exposure, total P&L)
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATH = path.join(process.env.HOME || '/tmp', '.foundry', 'positions.json');

export class PositionTracker {
  constructor(storePath = DEFAULT_PATH) {
    this.path = storePath;
    this._ensureDir();
    this.positions = this._load();
  }

  _ensureDir() {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _load() {
    if (!fs.existsSync(this.path)) {
      return { open: [], closed: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {
      return { open: [], closed: [] };
    }
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.positions, null, 2));
  }

  open(position) {
    if (!position.id) throw new Error('position.id required');
    if (!position.platform) throw new Error('position.platform required');
    if (!position.side || !['YES', 'NO'].includes(position.side)) {
      throw new Error('position.side must be YES or NO');
    }
    if (typeof position.size !== 'number' || position.size <= 0) {
      throw new Error('position.size must be positive number');
    }
    if (typeof position.entryPrice !== 'number' || position.entryPrice < 0 || position.entryPrice > 1) {
      throw new Error('position.entryPrice must be 0-1');
    }
    this.positions.open.push({
      ...position,
      openedAt: Date.now(),
    });
    this._save();
    return position.id;
  }

  close(id, exitPrice) {
    const idx = this.positions.open.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`position ${id} not found`);
    const pos = this.positions.open[idx];
    if (exitPrice < 0 || exitPrice > 1) throw new Error('exitPrice must be 0-1');

    // YES position: profit if exitPrice > entryPrice
    // NO position: profit if exitPrice < entryPrice
    const pnlPerShare = pos.side === 'YES'
      ? exitPrice - pos.entryPrice
      : pos.entryPrice - exitPrice;
    // Use rational arithmetic to avoid float precision issues: pnl = (a-b)*size/(1) but size is integer
    // Compute pnl as integer: (pnlPerShare * 1e18 * size) / 1e18 then round
    // Simpler: convert to integer math
    const pnlScaled = Math.round(pnlPerShare * 1e18) * pos.size;
    const pnl = pnlScaled / 1e18;
    const pnlPct = pnlPerShare / pos.entryPrice * 100;

    const closed = {
      ...pos,
      exitPrice,
      closedAt: Date.now(),
      pnl,
      pnlPct,
    };
    this.positions.closed.push(closed);
    this.positions.open.splice(idx, 1);
    this._save();
    return closed;
  }

  getOpen() {
    return [...this.positions.open];
  }

  getClosed() {
    return [...this.positions.closed];
  }

  /**
   * Compute current portfolio state.
   * @param {Function} priceResolver - async (position) => currentPrice
   */
  async portfolio(priceResolver) {
    let totalExposure = 0;
    let unrealizedPnl = 0;
    const positions = [];

    for (const pos of this.positions.open) {
      const currentPrice = await priceResolver(pos);
      const pnlPerShare = pos.side === 'YES'
        ? currentPrice - pos.entryPrice
        : pos.entryPrice - currentPrice;
      const pnlScaled = Math.round(pnlPerShare * 1e18) * pos.size;
      const pnl = pnlScaled / 1e18;
      const exposure = pos.size * pos.entryPrice;
      totalExposure += exposure;
      unrealizedPnl += pnl;
      positions.push({
        ...pos,
        currentPrice,
        pnl,
        pnlPct: pnlPerShare / pos.entryPrice * 100,
      });
    }

    const realizedPnl = this.positions.closed.reduce((s, p) => s + p.pnl, 0);
    const realizedPnlPct = this.positions.closed.length > 0
      ? this.positions.closed.reduce((s, p) => s + p.pnlPct, 0) / this.positions.closed.length
      : 0;

    return {
      positions,
      totalExposure,
      unrealizedPnl,
      realizedPnl,
      realizedPnlPct,
      totalPnl: unrealizedPnl + realizedPnl,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo
  const tracker = new PositionTracker('/tmp/positions-demo.json');

  tracker.open({
    id: 'p1',
    platform: 'polymarket',
    marketId: 'btc-100k-2026',
    side: 'YES',
    size: 100,
    entryPrice: 0.45,
  });
  tracker.open({
    id: 'p2',
    platform: 'drift',
    marketId: 'SOL-PERP',
    side: 'NO',
    size: 50,
    entryPrice: 0.60,
  });

  console.log('Open:', tracker.getOpen());
  tracker.close('p1', 0.55);
  console.log('Closed p1:', tracker.getClosed().pop());
  console.log('Still open:', tracker.getOpen());
}