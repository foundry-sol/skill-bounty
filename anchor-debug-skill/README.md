# anchor-debug-skill

Anchor program debugging toolkit for autonomous agents. Decodes errors, simulates transactions, traces logs, suggests fixes.

Solves three real problems for Solana agents:
1. **Error decoding** — `error_decoder.mjs` — Anchor + Solana runtime errors → human messages
2. **Transaction simulation** — `tx_simulator.mjs` — simulateTransaction wrapper + log parsing
3. **Fix suggestions** — `error_decoder.mjs` — every error has a recommended fix

## Quick start

```bash
npm install
node scripts/index.mjs demo
node --test tests/*.test.mjs
```

## CLI

```bash
node scripts/index.mjs decode 100
node scripts/index.mjs decode 6000
node scripts/index.mjs decode-tx error.json
node scripts/index.mjs parse-logs logs.txt
```

## Test

```bash
npm test
```

23 tests cover:
- Error decoding (known codes, custom errors, hex runtime errors)
- Transaction error parsing
- Log parsing (invoke, log, consumed, success, data)
- Call tree tracing (simple, nested, parallel)

## Real-world usage

Foundry uses this for:
- Decoding errors from failed trades
- Simulating transactions before submission
- Understanding program call flow
- Debugging smart contract issues

## Defense in depth

For Solana debugging:
1. **Always simulate first** — don't pay fees for failed transactions
2. **Track compute usage** — programs can OOM at 200K CU
3. **Parse the call tree** — nested CPIs can hide errors
4. **Check program logs** — error messages often explain the cause
5. **Look at recent blocks** — slot lag can cause BlockhashNotFound

## License

MIT.