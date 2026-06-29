#!/usr/bin/env node
/**
 * alert_engine.mjs — Evaluate alerts and persist them to a local store.
 *
 * Manages alert rules and triggered alerts. Provides:
 *   - Rule definitions (what to watch for)
 *   - Rule evaluation against proposals
 *   - Alert persistence (last seen per proposal)
 *   - Alert ack/dismiss functionality
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATH = path.join(process.env.HOME || '/tmp', '.foundry', 'governance-alerts.json');

export class AlertEngine {
  constructor(storePath = DEFAULT_PATH) {
    this.path = storePath;
    this._ensureDir();
    this.state = this._load();
  }

  _ensureDir() {
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _load() {
    if (!fs.existsSync(this.path)) {
      return { seen: {}, dismissed: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {
      return { seen: {}, dismissed: {} };
    }
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.state, null, 2));
  }

  /**
   * Process a list of (proposal, alerts) pairs and return NEW alerts (not yet seen).
   * @param {Array<{proposal, alerts}>} proposalAlerts
   */
  processAlerts(proposalAlerts) {
    const newAlerts = [];
    for (const { proposal, alerts } of proposalAlerts) {
      for (const alert of alerts) {
        const alertId = this._makeId(alert);
        if (this.state.seen[alertId]) continue;
        if (this.state.dismissed[alertId]) continue;
        this.state.seen[alertId] = Date.now();
        newAlerts.push(alert);
      }
    }
    this._save();
    return newAlerts;
  }

  dismiss(alertId) {
    this.state.dismissed[alertId] = Date.now();
    this._save();
  }

  clear() {
    this.state.seen = {};
    this.state.dismissed = {};
    this._save();
  }

  _makeId(alert) {
    const key = `${alert.type}-${alert.proposal.id}-${alert.message.slice(0, 30)}`;
    return key.replace(/\s+/g, '-').toLowerCase();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const engine = new AlertEngine('/tmp/governance-alerts-demo.json');
  engine.clear();
  console.log('Alert engine initialized');
}