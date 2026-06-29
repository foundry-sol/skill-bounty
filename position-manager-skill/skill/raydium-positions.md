# Raydium CLMM — Position Structure

> Read this when working specifically with Raydium positions. For protocol-agnostic concepts, see `SKILL.md`.

## Program ID
```
CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrK20WPo
```

## Position account

Raydium CLMM positions are PDAs:
```
[program_id, position_nft_mint_pubkey]
```

Fields needed:
- `poolId`: pubkey (32 bytes) — the pool this position belongs to
- `tickLower`: i32 — lower tick
- `tickUpper`: i32 — upper tick
- `liquidity`: u128 — LP amount
- `tokenFeesOwedA/B`: u64 each — uncollected fees

## Price from ticks

Same as Orca: `price = 1.0001 ^ tickIndex`

## Decoding recipe

```javascript
import { PublicKey } from '@solana/web3.js';

function decodeRaydiumPosition(data) {
  let offset = 8; // skip discriminator
  const poolId = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // Skip several fields depending on SDK version; tickLower/Upper at offsets ~ 32+44
  // Refer to Raydium SDK for exact layout
  // ...
  return { poolId /* , tickLower, tickUpper, ... */ };
}
```

## Resources

- SDK: https://github.com/raydium-io/raydium-sdk
- CLMM docs: https://docs.raydium.io/raydium/cpmm-and-clmm

---

This file provides protocol-specific context. The skill's core scripts work with any CLMM as long as the position JSON has `initial.price_lower/upper` and `current.price`.