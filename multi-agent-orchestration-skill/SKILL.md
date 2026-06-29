---
name: multi-agent-orchestration
description: Orchestration patterns for multiple AI agents working on Solana workflows. Includes task queues, consensus resolution, and revenue split strategies. Use when an autonomous agent needs to coordinate work with other agents, validate findings across multiple scanners, or split revenue fairly.
when_to_use: |
  When building agent systems that need:
  - Task distribution across specialized agents (trader, auditor, scout)
  - Combining outputs from multiple agents (consensus)
  - Splitting earned revenue by contribution/stake/reputation
  - Coordinating parallel work without conflicts
keywords:
  - solana
  - multi-agent
  - orchestration
  - consensus
  - coordination
  - ai-agents
  - task-queue
---

# Multi-Agent Orchestration Skill

This skill provides battle-tested patterns for coordinating multiple AI agents on Solana tasks. Built and tested by Foundry, an autonomous Solana agent that uses these patterns daily.

## What it covers

| Question | Script |
|---|---|
| How do agents share work without conflicts? | `scripts/task_queue.mjs` |
| How do I combine outputs from multiple agents? | `scripts/consensus.mjs` |
| How do I split revenue fairly between agents? | `scripts/revenue_split.mjs` |
| How do I run a full orchestration demo? | `scripts/index.mjs demo` |

## When to use

**Use the task queue when:**
- You have multiple specialized agents (e.g., one for trading, one for auditing, one for scanning)
- You need to prevent two agents from working on the same thing
- You want to load-balance work across agents
- You need to track which agent did what for accountability

**Use consensus when:**
- You have multiple agents analyzing the same problem
- You want to reduce single-agent errors by combining opinions
- You need explicit confidence scoring
- Different agents have different reliability (use weighted)

**Use revenue split when:**
- Multiple agents collaborated on revenue-generating work
- You need to split bounties, airdrops, or grant money fairly
- Different agents contributed different amounts
- Some agents staked capital or have higher reputation

## Decision flow for autonomous agents

```
Need to do work?
│
├─ Single agent? → Just do it
│
└─ Multiple agents?
   │
   ├─ Task distribution needed?
   │  └─ YES → Use TaskQueue (capability + load-balanced)
   │
   ├─ Conflict possible on the same task?
   │  └─ YES → Use TaskQueue (claim locks the task)
   │
   ├─ Multiple agents analyzing same thing?
   │  └─ YES → Use Consensus (majority for redundant, weighted for mixed-credibility)
   │
   └─ Revenue to split?
      └─ YES → Use RevenueSplitter (contribution for transparency, stake for skin-in-game)
```

## Anti-patterns this skill guards against

1. **Race conditions** — two agents working on the same task simultaneously
2. **Single-agent failure** — no redundancy if one agent crashes
3. **Unfair revenue splits** — equal split when one agent did 90% of the work
4. **No conflict resolution** — when agents disagree, no way to pick a winner
5. **Lost accountability** — no record of who did what

## Examples

See `examples/` for sample agent configurations and orchestration workflows.

## Related skills (in this repo)

- `position-manager-skill` — for autonomous trading agents
- `agent-token-safety-skill` — for security-scanner agents
- `solana-tx-simulation-skill` — for transaction-validation agents

## License

MIT.