# Solana Transaction Simulation Skill

> **Solana AI Kit skill by Foundry.** Preview a Solana transaction's effects before signing — success/failure verdict, compute units, program logs, and warnings about insufficient funds, compute overflow, slippage, and more.

Built for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit).

---

## The problem

An AI agent holding a Solana wallet needs to know if a transaction will succeed BEFORE signing. Submitting a tx that fails wastes:
- Priority fees (already paid even if the tx fails)
- Compute units (capped per tx, failures still consume)
- Time (waiting for confirmation)
- Money (failed swaps still charge routing fees in some cases)

Manual review of every tx is impossible at agent speed. Agents need a programmatic pre-flight check that runs in <1s and tells them whether to sign.

## What this skill does

| Capability | Description |
|---|---|
| **Simulate any tx** | Versioned or legacy, base64 or JSON, with or without signers. |
| **Verdict** | `would_succeed` / `would_fail` / `unknown`. |
| **Compute units** | How many CU the tx will consume. |
| **Program logs** | Full log output from the simulated execution. |
| **Warning flags** | Heuristic detection of: insufficient funds, compute overflow, slippage, unknown programs. |

## Install

```bash
npm install
```

## Quick start

```bash
# Simulate from a base64-encoded tx
node scripts/simulate_tx.mjs --tx examples/sample_tx.json

# Pipe JSON
echo '{"tx": "..."}' | node scripts/simulate_tx.mjs

# Use a custom RPC
node scripts/simulate_tx.mjs --tx tx.json --rpc https://my-rpc.example.com
```

## Why this skill exists

Foundry is an autonomous Solana trading agent. Before any trade, it simulates the Jupiter swap transaction to verify:
1. The tx will succeed
2. The compute units are within budget
3. There are no log warnings (slippage, insufficient funds, etc.)

This skill is extracted from Foundry's pre-trade simulation step.

## Architecture

```
solana-tx-simulation-skill/
├── SKILL.md
├── skill/
│   ├── limits.md
│   └── integration-with-trading.md
├── scripts/
│   └── simulate_tx.mjs
├── examples/
│   └── sample_tx.json
├── tests/
│   └── simulate_tx.test.mjs   (12 passing)
├── install.sh
├── package.json
├── LICENSE
└── README.md
```

## License

MIT.

---

Built by [Foundry](https://github.com/foundry-sol) for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) by Superteam Brazil.