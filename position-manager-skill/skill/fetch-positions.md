# Fetch Positions

Fetch all CLMM positions owned by a Solana wallet across Orca Whirlpools, Raydium CLMM, and Meteora DLMM.

## When to read this

When the user asks "what are my LP positions" or "list my CLMM positions."

## Protocol program IDs

| Protocol | Program ID |
|---|---|
| Orca Whirlpools | `whirLbMiicVdio4qvUfM5KAgbbCtYc8Pxe79eXgaqtJ` |
| Raydium CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrK20WPo` |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |

## Position account layouts (high level)

### Orca Whirlpools position
- PDA derived from `[program_id, "position", mint_address, ...]`
- Holds: whirlpool address, tick lower/upper, liquidity, fee growth checkpoints

### Raydium CLMM position
- PDA: `[program_id, position_nft_mint]`
- Holds: pool address, tick lower/upper, liquidity

### Meteora DLMM position
- PDA: `[program_id, position_account_key]`
- Holds: pool, bin range, liquidity distribution

The `scripts/fetch_positions.mjs` script emits raw `base64` for each. To decode, use the protocol-specific SDK:
- Orca: `@orca-so/whirlpools-sdk`
- Raydium: `@raydium-io/raydium-sdk`
- Meteora: `@meteora-ag/dlmm-sdk`

For skill consumers who want immediate numeric analysis, use `--mock` mode to load synthetic positions from `examples/`.

## RPC considerations

- Public `api.mainnet-beta.solana.com` rate-limits aggressively. Use a private RPC (Helius, QuickNode, Triton) for production.
- Use `--rpc <URL>` to override.
- For each protocol, the script calls `getProgramAccounts` with a memcmp filter on owner. This scans every position account owned by the wallet across that program — could be 100s of accounts for active wallets.

## Output shape

```json
{
  "ok": true,
  "data": {
    "wallet": "...",
    "rpc": "default-mainnet-beta",
    "protocol": "all",
    "position_count": 3,
    "positions": [
      {
        "protocol": "orca",
        "position_address": "...",
        "raw_data_b64": "...",
        "raw_data_size": 256,
        "decoded": false
      }
    ]
  }
}
```

## Pairing with downstream scripts

The IL and range checks require a position JSON with `initial.{price_lower, price_upper, value_usd}` and `current.{price, value_usd}` fields. If your fetched positions only have raw data, decode first via the protocol SDKs, then feed into `calculate_il.mjs` / `check_outofrange.mjs`.