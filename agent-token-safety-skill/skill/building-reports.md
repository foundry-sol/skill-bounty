# Building Token Safety Reports

How to construct a `TokenSafetyReport` for the composite scorer.

## The schema

```typescript
interface TokenSafetyReport {
  mint: string;
  holders?: {
    total_holders: number;       // best-effort count (top-20 if RPC-only)
    top_10_pct: number;          // % owned by top 10 wallets (0-100)
    top_1_pct?: number;          // % owned by top wallet
  };
  authorities?: {
    mint_authority: string | null;   // null = disabled
    freeze_authority: string | null;  // null = disabled
    supply: string | number;          // raw amount
    decimals: number;
  };
  liquidity?: {
    liquidity_usd: number;
    volume_24h_usd: number;
    pool_age_days: number;
  };
  social?: {
    has_twitter: boolean;
    has_website: boolean;
    twitter: string | null;
    website: string | null;
    telegram: string | null;
    twitter_followers?: number;
  };
  trading?: {
    volume_24h: number;
    volume_7d: number;
    txns_24h_buys: number;
    txns_24h_sells: number;
    buy_sell_ratio: number;
    price_change_24h_pct: number;
  };
}
```

All fields are optional. Missing fields score 0 in their component and don't trigger warnings.

## Where the data comes from

| Field | Source |
|---|---|
| `holders.*` | `fetch_holders.mjs` (RPC: `getTokenLargestAccounts` + `getTokenSupply`) |
| `authorities.*` | `fetch_authorities.mjs` (RPC: `getAccountInfo` jsonParsed) |
| `social.*` | `fetch_social.mjs` (DexScreener `info` field) |
| `liquidity.*` | Combine DexScreener + GeckoTerminal (free public APIs) |
| `trading.*` | DexScreener `volume` + `txns` fields |

## Composing a report in your agent

```js
import { fetchHolders } from './scripts/fetch_holders.mjs';
import { fetchAuthorities } from './scripts/fetch_authorities.mjs';
import { fetchSocial } from './scripts/fetch_social.mjs';
import { scoreSafety } from './scripts/assess_safety.mjs';

const mint = 'TokenAddr...';
const [holders, authorities, social] = await Promise.all([
  fetchHolders(mint, rpcUrl),
  fetchAuthorities(mint, rpcUrl),
  fetchSocial(mint),
]);

const report = {
  mint,
  holders: {
    total_holders: holders.data.total_holders,
    top_10_pct: holders.data.top_10_pct,
    top_1_pct: holders.data.top_1_pct,
  },
  authorities: {
    mint_authority: authorities.data.mint_authority,
    freeze_authority: authorities.data.freeze_authority,
    supply: authorities.data.supply_raw,
    decimals: authorities.data.decimals,
  },
  social: social.data.social,
  // Add liquidity + trading from DexScreener or GeckoTerminal here
};

const result = scoreSafety(report);
console.log(result.risk_grade, result.flags);
```

## Upgrading the data sources

The provided scripts use only public RPC + free DexScreener (no auth). For production:

- **Full holder list** — Helius DAS API, Birdeye, or run a custom indexer
- **Real-time social follower counts** — Twitter API v2
- **LP lock status** — GoPlus Security API
- **Mint authority check** — already covered by `getAccountInfo` jsonParsed

These upgrades don't require modifying the scorer — just feed it a richer `TokenSafetyReport`.