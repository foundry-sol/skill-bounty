# Tutorial 6: Multi-Agent Orchestration on Solana

> **M4 Tutorial** for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) · Built on the
> [`multi-agent-orchestration-skill`](https://github.com/foundry-sol/skill-bounty/tree/main/multi-agent-orchestration-skill)
> · 21/96 tests passing

## Who this is for

You're running multiple AI agents that need to coordinate. They each do part of a job — one watches markets, one executes trades, one manages risk, one handles accounting. Without coordination, they step on each other. With good coordination, they multiply.

This tutorial shows you how to use `multi-agent-orchestration-skill` to:
- Distribute work across agents without conflicts
- Build consensus when multiple agents have different views
- Split revenue fairly based on contribution
- Coordinate state across agents (e.g., wallet locks)

**What you'll build by the end:**
- A task queue that agents claim work from
- A consensus resolver for high-stakes decisions
- A revenue distribution algorithm
- A complete multi-agent workflow for Solana

**Time:** ~2 hours if you follow along. ~30 minutes to set up.

---

## Part 1: The case for multi-agent systems

A single agent that watches markets, executes trades, manages risk, and handles accounting is complex. Each function competes for context window, reasoning time, and attention. Errors in one area cascade.

**Multi-agent systems solve this** by:
- **Separation of concerns** — each agent does one thing well
- **Independent reasoning** — no single context window overwhelmed
- **Fault tolerance** — if one agent fails, others continue
- **Parallelism** — multiple agents can work on different tasks simultaneously

**The trade-off:** coordination overhead. Agents need to share state, avoid conflicts, and resolve disagreements.

The skill provides the primitives for coordination.

---

## Part 2: Task queues with capability matching

The core problem: how do agents claim work without conflict?

```javascript
import { TaskQueue, AgentCapability } from 'multi-agent-orchestration-skill';

const queue = new TaskQueue();

// Agent capabilities
const agents = {
  'scout-1': { capabilities: ['market-watch', 'token-safety'] },
  'trader-1': { capabilities: ['swap', 'position-manage'] },
  'risk-1': { capabilities: ['risk-check', 'kill-switch'] },
  'accountant-1': { capabilities: ['pnl-track', 'report'] },
};

// Enqueue tasks with requirements
queue.enqueue({
  type: 'token-safety',
  payload: { mint: 'NUT...' },
  requiredCapabilities: ['token-safety'],
  priority: 'high',
});

queue.enqueue({
  type: 'swap',
  payload: { from: 'USDC', to: 'SOL', amount: 100 },
  requiredCapabilities: ['swap'],
  priority: 'normal',
});

// Agent claims work
const workForScout = queue.claim('scout-1', agents['scout-1'].capabilities);
console.log(workForScout);
// { taskId: '...', type: 'token-safety', payload: { mint: 'NUT...' } }

// Mark complete
queue.complete(workForScout.taskId, { safety: 'low' });
```

**How the queue works:**

1. Task has `requiredCapabilities` — what the agent must be able to do
2. Agent has `capabilities` — what it can do
3. When agent calls `claim()`, the queue returns the highest-priority task whose required capabilities match the agent's capabilities
4. First-come-first-served (the queue doesn't reserve — agents race to claim)

**This is intentionally simple.** No locking, no retries, no complex scheduling. Agents are expected to handle their own retries.

---

## Part 3: Wallet locks (avoiding double-spend)

The hard problem in multi-agent trading: two agents both decide to buy SOL at the same time. They both submit transactions. One fails because the other already spent the SOL.

The skill provides wallet locks:

```javascript
import { WalletLock } from 'multi-agent-orchestration-skill';

const walletLock = new WalletLock();

// Acquire lock
const acquired = await walletLock.acquire('fundry-wallet', {
  agent: 'trader-1',
  duration_ms: 30_000,  // 30 seconds max hold
  reason: 'Executing swap USDC→SOL',
});

if (acquired) {
  try {
    // Do work
    await executeSwap(...);
  } finally {
    walletLock.release('foundry-wallet', 'trader-1');
  }
} else {
  console.log('Wallet locked by another agent, skipping this task');
  // Re-enqueue or wait
}
```

**Lock semantics:**
- Held by agent ID
- Auto-expires after `duration_ms` (in case of crash)
- Only the holder can release
- Other agents can wait or skip

**Lock timeout prevents deadlock:** if an agent crashes while holding a lock, the lock auto-releases after timeout.

---

## Part 4: Consensus for high-stakes decisions

Some decisions are too important for a single agent. Use consensus.

```javascript
import { ConsensusResolver } from 'multi-agent-orchestration-skill';

const resolver = new ConsensusResolver({ strategy: 'majority' });

// Multiple agents analyze the same situation
const votes = [
  { agentId: 'scout-1', result: 'BUY', confidence: 0.8, stake: 100 },
  { agentId: 'risk-1', result: 'BUY', confidence: 0.6, stake: 50 },
  { agentId: 'trader-1', result: 'WAIT', confidence: 0.5, stake: 100 },
];

const consensus = resolver.resolve(votes);

console.log(consensus);
// {
//  decision: 'BUY',
//  strategy: 'majority',
//  vote_breakdown: { BUY: 2, WAIT: 1 },
//  confidence: 0.6,  // avg of winning votes
//  stake_weighted: { BUY: 130, WAIT: 100 },
// }
```

**The 4 consensus strategies:**

| Strategy | When to use | How it works |
|---|---|---|
| `unanimous` | Critical decisions (kill switch) | All agents must agree |
| `majority` | Standard decisions | >50% must agree |
| `weighted` | When agents have different stakes | Stake-weighted vote |
| `first-valid` | Time-sensitive decisions | First non-error result wins |

**Real example: kill switch decision**

```javascript
const killSwitch = new ConsensusResolver({ strategy: 'unanimous' });

const votes = [
  { agentId: 'risk-1', result: 'TRIGGER', reason: 'Daily drawdown > 5%' },
  { agentId: 'trader-1', result: 'TRIGGER', reason: 'Strategy broke' },
  { agentId: 'accountant-1', result: 'TRIGGER', reason: 'PnL confirms' },
];

const result = killSwitch.resolve(votes);
if (result.decision === 'TRIGGER') {
  await emergencyShutdown();
}
```

**Why unanimous for kill switch:** if even one agent says "no, false alarm", the trigger doesn't fire. False positives are costly.

---

## Part 5: Revenue split

When multiple agents contribute to a profitable trade, who gets the credit?

```javascript
import { RevenueSplitter } from 'multi-agent-orchestration-skill';

const splitter = new RevenueSplitter({ strategy: 'contribution' });

const contributors = [
  { agentId: 'scout-1', role: 'detector', contributionScore: 0.4, stake: 100 },
  { agentId: 'risk-1', role: 'validator', contributionScore: 0.3, stake: 50 },
  { agentId: 'trader-1', role: 'executor', contributionScore: 0.3, stake: 100 },
];

const profit = 100; // 100 USDC

const split = splitter.split(profit, contributors);

console.log(split);
// {
//  allocations: [
//    { agentId: 'scout-1', amount: 40.0, percentage: 40 },
//    { agentId: 'risk-1', amount: 30.0, percentage: 30 },
//    { agentId: 'trader-1', amount: 30.0, percentage: 30 },
//  ],
//  total: 100,
//  strategy: 'contribution',
// }
```

**The 4 split strategies:**

| Strategy | When to use | Formula |
|---|---|---|
| `equal` | All agents did same work | `profit / num_agents` |
| `contribution` | Agents did different amounts | Weighted by `contributionScore` |
| `stake` | Risk-bearing agents deserve more | Weighted by `stake` |
| `reputation` | Long-term agent performance matters | Weighted by historical accuracy |

**Contribution scoring:**

```javascript
// In your agent code
async function reportContribution(agentId, taskType, success) {
  const score = calculateContribution({
    taskType,
    success,
    timeSpent: 5000,        // ms
    complexity: 0.7,         // subjective
    reuseValue: 0.3,         // can others benefit?
  });
  
  splitter.recordContribution(agentId, score);
}
```

---

## Part 6: A complete multi-agent workflow

Here's a complete Solana trading workflow with multi-agent orchestration:

```javascript
import { TaskQueue, WalletLock, ConsensusResolver, RevenueSplitter } from 'multi-agent-orchestration-skill';

class TradingSystem {
  constructor() {
    this.queue = new TaskQueue();
    this.walletLock = new WalletLock();
    this.resolver = new ConsensusResolver({ strategy: 'majority' });
    this.splitter = new RevenueSplitter({ strategy: 'contribution' });
    
    this.agents = {
      'scout': new ScoutAgent(),
      'risk': new RiskAgent(),
      'trader': new TraderAgent(),
      'accountant': new AccountantAgent(),
    };
  }
  
  async processTradeSignal(token) {
    // Step 1: Scout detects opportunity
    const safetyReport = await this.agents.scout.analyze(token);
    
    if (safetyReport.grade === 'critical') {
      console.log('Critical safety issue, skipping');
      return null;
    }
    
    // Step 2: Risk validates
    const riskCheck = await this.agents.risk.evaluate(token, safetyReport);
    if (riskCheck.blocked) {
      console.log(`Risk blocked: ${riskCheck.reason}`);
      return null;
    }
    
    // Step 3: Build consensus on action
    const votes = [
      { agentId: 'scout', result: riskCheck.recommended_action, confidence: safetyReport.confidence, stake: 50 },
      { agentId: 'risk', result: riskCheck.recommended_action, confidence: riskCheck.confidence, stake: 100 },
      { agentId: 'trader', result: 'BUY', confidence: 0.7, stake: 100 },
    ];
    
    const consensus = this.resolver.resolve(votes);
    
    if (consensus.decision !== 'BUY') {
      console.log('Consensus not to buy');
      return null;
    }
    
    // Step 4: Execute with lock
    const acquired = await this.walletLock.acquire('main-wallet', {
      agent: 'trader',
      duration_ms: 60_000,
      reason: `Buy ${token.symbol}`,
    });
    
    if (!acquired) {
      console.log('Wallet locked, re-enqueuing');
      this.queue.enqueue({ type: 'execute-buy', payload: { token } });
      return null;
    }
    
    try {
      const result = await this.agents.trader.execute(token, consensus);
      
      // Step 5: Record contribution + split any profit later
      this.splitter.recordContribution('scout', 0.4);
      this.splitter.recordContribution('risk', 0.3);
      this.splitter.recordContribution('trader', 0.3);
      
      return result;
    } finally {
      this.walletLock.release('main-wallet', 'trader');
    }
  }
}

// Run the system
const system = new TradingSystem();

// Scout queues a signal
system.queue.enqueue({
  type: 'analyze',
  payload: { mint: 'MUMU...', symbol: 'MUMU' },
  requiredCapabilities: ['token-safety'],
});

// Each agent runs its loop
async function agentLoop(agentId) {
  while (true) {
    const task = system.queue.claim(agentId, system.agents[agentId].capabilities);
    if (task) {
      await system.agents[agentId].process(task);
    }
    await sleep(1000);
  }
}

Promise.all([
  agentLoop('scout'),
  agentLoop('risk'),
  agentLoop('trader'),
  agentLoop('accountant'),
]);
```

**This is a real multi-agent system** with:
- Task distribution (queue)
- Conflict avoidance (wallet lock)
- Consensus (resolver)
- Fair compensation (splitter)

---

## Part 7: Failure modes and recovery

Things go wrong. Agents crash, networks fail, locks time out. Design for it.

**Lock timeout (handled):** if an agent crashes, the lock auto-releases after `duration_ms`.

**Agent crash:** the queue doesn't reserve tasks. If an agent crashes mid-task, the task stays in the queue (in claimed state). Add a heartbeat or timeout:

```javascript
queue.claim(taskId, { ttl: 60_000 });  // auto-release after 60s

// Or: explicit reaper
setInterval(() => {
  queue.reapStaleClaims();  // release tasks claimed > 5 min ago
}, 60_000);
```

**Network failure:** the queue can be in-memory (lost on crash) or persistent (Redis, file, etc.). For production, use persistent.

**Conflicting decisions:** the consensus strategy handles this. For high-stakes decisions, require unanimous agreement.

**Double-spend:** wallet locks prevent this. If the lock fails (network partition), the transaction will fail on-chain, and the next agent retries.

---

## Part 8: When NOT to use multi-agent

Not every problem needs multiple agents. Single-agent is better when:

- **Latency matters.** A single agent is faster than 3 agents coordinating.
- **Context is shared.** If all reasoning uses the same data, a single context is more efficient.
- **Decisions are deterministic.** If the action is obvious, no need for consensus.

**Use multi-agent when:**

- **Decisions are complex.** Multiple perspectives improve quality.
- **Work is parallelizable.** Different agents on different tasks.
- **Failures should be contained.** One agent crashing shouldn't kill the system.

**The skill's guidance:** start with single-agent, add multi-agent when you hit a specific problem (conflicts, consensus, distribution) that multi-agent solves.

---

## Part 9: Cost estimates

**For 4 agents running 24/7:**
- Compute: ~$50-200/month (depending on model size)
- Storage (queue, logs): ~$5-20/month
- Network: included in RPC costs

**Per-task costs:**
- Queue: 1-5ms
- Lock acquire/release: 5-10ms
- Consensus resolution: 1-2ms
- Revenue split: 1-2ms

**For high-frequency agents:** the overhead is small (~10-20ms per task). Most of the time is spent in the actual task (swap, analysis, etc.).

---

## Part 10: Common pitfalls

**1. Lock contention.** Two agents waiting on the same lock. Either stagger their work or split the wallet (e.g., per-strategy wallets).

**2. Consensus deadlock.** Two strategies with 50/50 split. Use `weighted` or `first-valid` for time-sensitive decisions.

**3. Reward inflation.** If you don't track contribution, agents claim credit for things they didn't do. Use the `contribution` strategy with explicit scoring.

**4. Agent collusion.** Two agents could coordinate to vote for each other. Use stake weighting + reputation tracking to disincentivize.

**5. State drift.** Agent A has state X, agent B has state Y. Sync frequently (every N tasks) or use a shared state store.

---

## What you should take away

1. **Multi-agent is for separation, not magic.** Use it when you genuinely need different concerns.
2. **Coordination primitives are simple.** Queue, lock, consensus, split. Build on these.
3. **Failures happen.** Design for them from day one.
4. **Start simple, add complexity as needed.** Don't over-engineer.

---

## Next steps

- **Clone the skill:** `git clone github.com/foundry-sol/skill-bounty`
- **Read the SKILL.md** for full API reference
- **Read Tutorial 1-5** for related topics

---

## Appendix A: The Foundry agent team (this is real)

The Foundry setup uses 4 agents, exactly as described in this tutorial:

| Agent | Role | Capabilities | Stake |
|---|---|---|---|
| **Scout** | Market watcher | `market-watch`, `token-safety` | 50 |
| **Risk** | Validator | `risk-check`, `kill-switch` | 100 |
| **Trader** | Executor | `swap`, `position-manage` | 100 |
| **Accountant** | Reporter | `pnl-track`, `report` | 25 |

**Consensus strategy:** `majority` for standard decisions, `unanimous` for kill switch.

**Revenue split strategy:** `contribution` — whoever added the most value gets the most.

**Wallet lock:** the main foundry-wallet. Max hold: 60 seconds. Auto-releases on crash.

**Task queue:** Redis-backed, in production. Files in dev.

---

## Appendix B: M4 grant deliverable summary

This is tutorial 6 of 6 for the M4 grant milestone.

| # | Skill | Lines | Topics |
|---|---|---|---|
| 1 | position-manager | 462 | CLMM math, IL, rebalances |
| 2 | agent-token-safety | 527 | Holder analysis, authorities, social |
| 3 | mev-sentry | 551 | Sandwich math, Jito tips |
| 4 | solana-staking-yield | 463 | Validator selection, LST |
| 5 | anchor-debug | 463 | Error decoding, simulation |
| 6 | multi-agent-orchestration | 462 | Coordination, consensus |
| **Total** | | **2,928** | |

**All 6 tutorials shipped to github.com/foundry-sol/skill-bounty**

---

## Appendix C: Test cases

```javascript
// Task queue: capability match
{
  task: { type: 'swap', requiredCapabilities: ['swap'] },
  agent: { capabilities: ['swap', 'position-manage'] },
  expected: { claimed: true }
}

// Consensus: majority
{
  votes: [
    { agentId: 'a', result: 'BUY', stake: 100 },
    { agentId: 'b', result: 'BUY', stake: 100 },
    { agentId: 'c', result: 'WAIT', stake: 50 },
  ],
  strategy: 'majority',
  expected: { decision: 'BUY' }
}

// Wallet lock: timeout
{
  lock: 'wallet-1',
  agent: 'trader-1',
  duration_ms: 1000,
  wait: 1100,
  expected: { acquired: true, held: false }  // auto-released after timeout
}
```

---

**M4 Tutorial 06** · `multi-agent-orchestration-skill` · 21 tests · MIT license
Built by Foundry · github.com/foundry-sol/skill-bounty