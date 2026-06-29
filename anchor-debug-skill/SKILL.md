---
name: anchor-debug
description: Anchor program debugging toolkit for Solana agents. Decodes transaction error codes, simulates transactions, traces instruction calls, parses program logs, and provides fix suggestions.
when_to_use: |
  When an agent needs to:
  - Decode an Anchor transaction error
  - Simulate a transaction before submitting
  - Trace instruction calls from program logs
  - Get fix suggestions for common Anchor errors
  - Parse Solana runtime errors from hex codes
keywords:
  - solana
  - anchor
  - debug
  - errors
  - simulation
  - logs
  - transactions
---

# Anchor Debug Skill

Anchor program debugging toolkit. Decodes error codes, simulates transactions, traces instruction calls, parses program logs.

## What it covers

| Question | Script |
|---|---|
| What does Anchor error 153 mean? | `scripts/error_decoder.mjs` |
| How do I decode a transaction error response? | `scripts/error_decoder.mjs` |
| How do I simulate a transaction? | `scripts/tx_simulator.mjs` |
| How do I parse program logs? | `scripts/tx_simulator.mjs` |
| How do I use it from CLI? | `scripts/index.mjs` |

## When to use

**For debugging failed transactions:**
1. Get the error response from `simulateTransaction`
2. Run through `decodeTransactionError(err)`
3. Get the fix suggestion from the decoded error

**For understanding program logs:**
1. Get logs from a transaction
2. Run through `parseLogs(logs)`
3. Build a call tree with `traceInstructions(parsedLogs)`

## Decision flow

```
Have a failed transaction?
│
├─ Get the error response
│  │
│  └─ decodeTransactionError(response)
│     │
│     ├─ type: 'InstructionError'
│     │  │
│     │  ├─ code in known Anchor errors → fix suggestion included
│     │  │
│     │  └─ code >= 6000 → custom program error
│     │     └─ Check program source for #[error_code] enum
│     │
│     └─ type: 'BlockhashNotFound'
│        └─ Re-fetch blockhash and retry
│
├─ Parse logs for clues
│  │
│  └─ Look for "Program log: <message>"
│     │
│     ├─ Anchor require!() failed → check the condition
│     │
│     └─ Anchor error message → search program source
│
└─ Fix and retry
```

## Anti-patterns this skill guards against

1. **Submitting broken transactions** — simulate first
2. **Ignoring compute usage** — track CU from consumed logs
3. **Not parsing call tree** — nested CPIs can hide errors
4. **Treating all errors as fatal** — some are recoverable (BlockhashNotFound)
5. **No fix suggestion** — every error has a recommended fix

## What this skill does NOT do

- Does NOT execute transactions (only simulates)
- Does NOT have access to private programs
- Does NOT cover all Anchor errors (only common ones)
- Does NOT handle version-specific errors (Anchor version differences)

## Related skills (in this repo)

- `solana-tx-simulation-skill` — pre-flight tx validation
- `mev-sentry-skill` — MEV protection
- `prediction-market-skill` — prediction market data

## License

MIT.