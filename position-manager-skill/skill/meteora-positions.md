# Meteora DLMM — Position Structure

> Read this when working specifically with Meteora positions. For protocol-agnostic concepts, see `SKILL.md`.

## Program ID
```
LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
```

## Position account

Meteora DLMM positions are PDAs:
```
[program_id, position_pubkey]
```

Fields needed:
- `pool`: pubkey — the DLMM pool
- `binRange`: [i32, i32] — the bin range this position covers
- `liquidityShares`: u128 — shares in the bin
- `feeX/feeY`: u64 each — uncollected fees

## Price from bins

Meteora uses bins instead of ticks. Bin ID → price:
```
price = (1 + binStep / 10000) ^ (binId - referenceBinId) * referencePrice
```

Where `binStep` is per-pool (basis points, e.g., 1, 5, 100).

For this skill, **operate on prices directly** — convert bin range to price range before using `calculate_il.mjs` etc.

## Decoding recipe

```javascript
import { PublicKey } from '@solana/web3.js';

function decodeMeteoraPosition(data) {
  // 8 byte discriminator
  let offset = 8;
  const pool = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  // ... other fields depend on Meteora SDK version
  return { pool };
}
```

## Resources

- SDK: https://github.com/MeteoraAg/dlmm-sdk
- Docs: https://docs.meteora.ag/

---

This file provides protocol-specific context. The skill's core scripts work with any CLMM as long as the position JSON has `initial.price_lower/upper` and `current.price`.