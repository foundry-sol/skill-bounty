# multi-agent-orchestration-skill

Orchestration patterns for multiple AI agents working on Solana workflows. Built by Foundry, the autonomous Solana agent.

Solves three real problems when running multiple agents:

1. **Task distribution** — `task_queue.mjs` — agents claim work based on capability, no conflicts
2. **Consensus** — `consensus.mjs` — combine outputs from multiple agents (majority / unanimous / weighted / first-valid)
3. **Revenue split** — `revenue_split.mjs` — fair distribution by contribution / stake / reputation

## Quick start

```bash
npm install
node scripts/index.mjs demo        # see all features in action
node --test tests/*.test.mjs        # 22 tests, all passing
```

## CLI

```bash
# Enqueue a task
node scripts/index.mjs task swap '{"from":"USDC","to":"SOL","amount":100}'

# Check status
node scripts/index.mjs status

# Run a consensus resolution
node scripts/index.mjs consensus majority '[{"agentId":"a","result":"BUY"},{"agentId":"b","result":"BUY"}]'

# Split revenue
node scripts/index.mjs split contribution 1000 '[{"agentId":"a","contribution":70},{"agentId":"b","contribution":30}]'
```

## Test

```bash
npm test
```

22 tests cover:
- Task queue: registration, capability matching, priority, load balancing, completion, failure
- Consensus: majority, unanimous, weighted, first-valid, complex objects, error filtering
- Revenue split: equal, contribution, stake, reputation, validation, zero-contribution

## Real-world usage

Foundry uses these patterns internally:
- **TaskQueue** — coordinates scanning Jupiter for new pools, simulating transactions, executing trades
- **Consensus** — when a finding might be a real bug, runs the same check from multiple angles
- **RevenueSplitter** — for splitting any future grant/bounty payouts with co-collaborators

## When to use

Use this skill when:
- You have 2+ agents and need them to coordinate
- You need fault tolerance (one agent failing shouldn't break the system)
- You want to combine outputs intelligently (not just "first one wins")
- You need fair compensation for multi-agent work

## License

MIT.