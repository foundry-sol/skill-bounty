# governance-watcher-skill

Solana DAO governance monitoring for autonomous agents. Tracks Realms proposals, evaluates alert rules, simulates vote outcomes.

Solves three real problems:
1. **Proposal tracking** — `proposal_tracker.mjs` — Realms API + state normalization
2. **Vote simulation** — `vote_simulator.mjs` — pessimistic/optimistic outcome modeling
3. **Alert engine** — `alert_engine.mjs` — persistent alerts with dedup + dismiss

## Quick start

```bash
npm install
node scripts/index.mjs demo
node --test tests/*.test.mjs
```

## CLI

```bash
node scripts/index.mjs realms
node scripts/index.mjs proposals <realm-id>
node scripts/index.mjs watch <realm-id>
node scripts/index.mjs simulate 350 100 1000 86400
```

## Test

```bash
npm test
```

21 tests cover:
- Proposal normalization
- Vote breakdown + quorum
- Time remaining calculations
- Alert evaluation
- Vote simulation (pessimistic vs optimistic)
- Alert persistence + dedup + dismiss

## Real-world usage

Foundry uses this for:
- Monitoring Mango, Marinade, Jupiter governance
- Getting notified before important votes close
- Simulating "will this pass?" scenarios
- Tracking proposal state transitions

## Defense in depth

For governance monitoring:
1. **Set conservative alert thresholds** — better to over-alert than miss
2. **Persist alert state** — don't spam the same alert every run
3. **Track multiple realms** — not just one
4. **Use pessimistic simulations** — assume worst case
5. **Verify on-chain before voting** — alerts are not votes

## License

MIT.