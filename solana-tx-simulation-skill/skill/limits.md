# Limits

What this skill does and doesn't do.

## Does

- **Calls Solana RPC's `simulateTransaction`** method
- **Returns the verdict** (succeed / fail) based on the `err` field of the result
- **Surfaces compute units consumed** by the simulated execution
- **Returns full program logs** for downstream parsing
- **Heuristically flags** known log patterns (insufficient funds, compute overflow, slippage, unknown programs)
- **Handles both Versioned and legacy transactions** (auto-detected from base64)
- **Supports `replaceRecentBlockhash`** so you don't need the actual blockhash in the tx
- **Optional signing** with one or more keypair files

## Doesn't

- **Doesn't compute token balance changes** — Solana's simulateTransaction doesn't return pre/post token account state. For that, you'd need to:
  1. Call `getMultipleAccountsInfo` for all token accounts BEFORE the tx
  2. Simulate
  3. Call `getMultipleAccountsInfo` again
  4. Diff
  5. Build a separate script or fork this one.
- **Doesn't check if a tx will be profitable** — that's domain logic (e.g., is the output > input?).
- **Doesn't detect MEV / sandwich attacks** — those happen between simulation and landing.
- **Doesn't simulate cross-chain** — Solana only.
- **Doesn't handle versioned tx with lookup tables** — partial support; the script will warn.
- **Doesn't validate the transaction structure** — for that, use a TypeScript or Rust client with strict types.

## Simulation accuracy

- **Without signers:** Uses `replaceRecentBlockhash: true` and `sigVerify: false`. Fast, free, but the simulated blockhash may differ from the actual one.
- **With signers:** Uses the actual blockhash in the tx. Slower (requires fetching signers), more accurate.
- **Logs are accurate** for both modes — the actual program execution is the same.
- **State changes are accurate** for both modes — Solana simulates the same way whether the signature verifies or not.

## Compute units

- `compute_units_consumed` is what the tx would actually consume.
- Default tx compute budget is 200k CU (1.4M with `ComputeBudgetInstruction`).
- If the tx exceeds the budget, simulation returns an error.
- Use this field to set priority fees accurately.

## RPC requirements

- Public `api.mainnet-beta.solana.com` works for `simulateTransaction` but rate-limits.
- For production monitoring, use a private RPC (Helius, QuickNode, Triton).
- Some RPCs return slightly different fields. The script handles missing fields gracefully.

## Error handling

- **Invalid base64** → script exits with `1`, error in output
- **Invalid transaction bytes** → script exits with `1`, error in output
- **RPC error** → script exits with `1`, error in output
- **Transaction would fail** → script exits with `2`, full details in output
- **Success** → script exits with `0`

Use these exit codes in shell pipelines and orchestration logic.