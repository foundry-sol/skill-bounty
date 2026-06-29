---
name: solana-tx-simulation
description: Simulate Solana transactions before signing — returns success/failure verdict, compute units consumed, program logs, and warnings about insufficient funds, compute overflow, slippage, etc. Critical pre-flight check for AI agents. Built for the Solana AI Kit.
version: 1.0.0
license: MIT
author: Foundry
---

# Solana Transaction Simulation

Preview what a Solana transaction will do before signing. Catches: failed transactions, insufficient funds, compute budget overflow, slippage, and other log-based warnings.

## When to use this skill

Load this skill when the user asks any of:

- "Simulate this transaction before I sign."
- "Will this transaction succeed?"
- "What will happen if I send this tx?"
- "Is this tx safe? Will it cost more compute than expected?"
- "Check if the slippage will hit."

Don't load for:

- Actually sending a transaction (use Jupiter + signing).
- Reading account state (use getAccountInfo).
- Estimating priority fees (separate concern).

## Scripts (callable)

All scripts are in `scripts/` and use Node.js ≥18 with `@solana/web3.js`.

```bash
# Simulate a base64-encoded transaction
node scripts/simulate_tx.mjs --tx examples/sample_tx.json [--rpc <URL>]

# Pipe JSON via stdin
echo '{"tx": "..."}' | node scripts/simulate_tx.mjs
```

All scripts emit structured JSON suitable for agent reasoning.

## Inputs

```json
{
  "tx": "<base64-encoded VersionedTransaction or Transaction>",
  "rpc": "https://api.mainnet-beta.solana.com",
  "signers": ["./keypair.json"]
}
```

`signers` is optional — if omitted, the script does a `replaceRecentBlockhash` simulation with `sigVerify: false`. With signers, you get a more accurate simulation but the signers must be present (use sparingly on mainnet).

## Outputs

```json
{
  "ok": true,
  "data": {
    "success": true,
    "verdict": "would_succeed",
    "error": null,
    "compute_units_consumed": 4500,
    "log_count": 12,
    "logs": ["..."],
    "warnings": [],
    "has_return_data": false,
    "return_data": null
  }
}
```

## Verdict values

- `would_succeed` — transaction will execute successfully
- `would_fail` — transaction will fail; check `error` and `warnings`
- `unknown` — simulation didn't return enough data to decide

## Exit codes

- `0` — `would_succeed`
- `2` — `would_fail` (predicted failure)
- `1` — script error (RPC, parse, etc.)

Use the exit code in shell pipelines:
```bash
node scripts/simulate_tx.mjs --tx tx.json && echo "safe to sign" || echo "DO NOT SIGN"
```

## Warning patterns detected

The script scans program logs for these patterns:

- `insufficient funds`
- `attempt to debit`
- `compute budget exceeded`
- `slippage tolerance exceeded`
- `unknown program invocation`

Any match surfaces in the `warnings` array. Extend `suspiciousPatterns` in `scripts/simulate_tx.mjs` to add more.

## Limits

- This script uses `replaceRecentBlockhash: true` by default — the simulation runs against a fresh blockhash, not the tx's actual blockhash.
- It does NOT compute token balance changes. For that, diff pre/post token accounts via a separate API.
- Simulation cost on mainnet = free (no signature verification).
- Simulation cost on devnet/testnet = free.

## License

MIT.