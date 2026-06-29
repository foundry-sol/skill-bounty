# Orca Whirlpools — Position Structure

> Read this when working specifically with Orca positions. For protocol-agnostic concepts, see `SKILL.md`.

## Program ID
```
whirLbMiicVdio4qvUfM5KAgbbCtYc8Pxe79eXgaqtJ
```

## Position account

Each Orca position is a PDA derived from:
```
["position", whirlpool_pubkey, position_mint_pubkey]
```

Fields needed for this skill (offsets approximate, verify against latest SDK):
- `whirlpool`: pubkey (32 bytes) — the pool this position belongs to
- `positionMint`: pubkey (32 bytes) — the NFT-like mint for this position
- `tickLowerIndex`: i32 (4 bytes) — lower tick of the position's range
- `tickUpperIndex`: i32 (4 bytes) — upper tick of the position's range
- `liquidity`: u128 (16 bytes) — LP tokens in the position
- `feeGrowthCheckpointA/B`: u128 each — fee growth snapshots

## Price from ticks

For a Whirlpool, tick index maps to price via:
```
price = 1.0001 ^ tickIndex
```

So if `tickLowerIndex = -10000`:
```
price_lower = 1.0001 ^ -10000 ≈ 0.3679
```

And if `tickUpperIndex = 10000`:
```
price_upper = 1.0001 ^ 10000 ≈ 2.718
```

## Decoding recipe

```javascript
import { PublicKey } from '@solana/web3.js';

function decodeOrcaPosition(data, account) {
  // Skip 8-byte discriminator
  let offset = 8;
  const whirlpool = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const positionMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tickLowerIndex = data.readInt32LE(offset); offset += 4;
  const tickUpperIndex = data.readInt32LE(offset); offset += 4;
  const liquidity = data.readBigUInt64LE(offset); offset += 8; // lower 8 bytes of u128
  // ... (full decode requires SDK)
  return { whirlpool, positionMint, tickLowerIndex, tickUpperIndex, liquidity };
}

function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}
```

## When Orca positions fail

- If `liquidity = 0`: position has been withdrawn, ignore.
- If `tickLowerIndex >= tickUpperIndex`: malformed, ignore.

## Resources

- SDK: https://github.com/orca-so/whirlpools-sdk
- Docs: https://orca-so.github.io/whirlpools/

---

This file provides protocol-specific context. The skill's core scripts work with any CLMM as long as the position JSON has `initial.price_lower/upper` and `current.price`.