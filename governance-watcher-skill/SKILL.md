---
name: governance-watcher
description: Solana DAO governance monitoring for AI agents. Tracks proposals, voting periods, and outcomes across Realms (SPL Governance). Includes alert rules for proposal states, vote deadlines, and quorum thresholds.
when_to_use: |
  When an agent needs to:
  - Monitor Solana DAO proposals (Mango, Marinade, Jupiter, etc.)
  - Get alerted when votes are ending soon
  - Track quorum progress
  - Simulate vote outcomes with pessimistic/optimistic assumptions
  - Persist alert state across runs
keywords:
  - solana
  - governance
  - dao
  - realms
  - voting
  - spl-governance
  - alerts
---

# Governance Watcher Skill

Solana DAO governance monitoring. Tracks proposals from Realms (SPL Governance), evaluates alert rules, simulates vote outcomes.

## What it covers

| Question | Script |
|---|---|
| What DAOs exist? | `scripts/proposal_tracker.mjs` |
| What proposals are voting now? | `scripts/proposal_tracker.mjs` |
| Will this proposal pass? | `scripts/vote_simulator.mjs` |
| Which alerts fire when? | `scripts/alert_engine.mjs` |
| How do I use it from CLI? | `scripts/index.mjs` |

## When to use

**For DAO monitoring:**
1. List realms (DAOs) to monitor
2. Fetch proposals from each realm
3. Apply alert rules (deadline, quorum, state changes)
4. Persist alert state to avoid duplicates
5. Simulate vote outcomes for "should I vote?" decisions

**For governance agents:**
- Auto-vote based on alert rules (not implemented — vote submission requires wallet auth)
- Track proposals you care about
- Compute voting power via TokenOwnerRecord

## Decision flow

```
Want to monitor DAO governance?
│
├─ Identify realms of interest
│  └─ solana-governance realms
│
├─ Fetch proposals
│  └─ solana-governance proposals <realm-id>
│
├─ Set up alert rules
│  │
│  └─ Rule types:
│     ├─ state: ["Voting", "Succeeded"] → notify on these states
│     ├─ deadlineHours: 48 → notify when <48h remaining
│     ├─ quorumThreshold: 0.5 → notify when quorum reached
│     └─ voteSwingThreshold: 0.6 → notify when YES > 60%
│
├─ Run watch periodically
│  └─ solana-governance watch <realm-id>
│     │
│     └─ Returns NEW alerts only (deduplicated)
│
└─ Decision point: Should I vote?
   │
   └─ solana-governance simulate yes no maxVoters
      │
      ├─ PASSING → Already winning, vote YES if you support
      │
      ├─ LEAN_PASS → Close call, your vote matters
      │
      └─ AT_RISK → Currently losing
```

## Anti-patterns this skill guards against

1. **Alert fatigue** — deduplicates seen alerts, only fires new ones
2. **Missing deadlines** — alerts before votes close
3. **Not tracking state changes** — Voted → Succeeded → Executed
4. **Optimistic vote estimates** — supports pessimistic assumptions
5. **Forgetting dismissed alerts** — explicit dismiss state

## What this skill does NOT do

- Does NOT submit votes (requires wallet auth)
- Does NOT track voting power directly (use Realms UI)
- Does NOT handle private governance (some DAOs use Snapshot)

## Related skills (in this repo)

- `prediction-market-skill` — similar patterns, different domain
- `mev-sentry-skill` — for swap protection
- `multi-agent-orchestration-skill` — multi-agent consensus on votes

## License

MIT.