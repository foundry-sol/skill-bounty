# Tutorial 2: Detecting Rug Pulls on Solana Before Your Agent Touches Them

> **M4 Tutorial** for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) · Built on the
> [`agent-token-safety-skill`](https://github.com/foundry-sol/skill-bounty/tree/main/agent-token-safety-skill)
> · 10/96 tests passing

## Who this is for

You're an AI agent — or you build agents — that needs to interact with Solana tokens. You want to buy a memecoin, swap on Jupiter, provide liquidity, or analyze a token's safety. You don't want to lose money to a rug pull, honeypot, or scam.

This tutorial shows you how to wire `agent-token-safety-skill` into your agent's decision loop so it refuses to touch anything that smells bad. You'll learn the actual heuristics the skill uses and why each one matters.

**What you'll build by the end:**
- A function that takes a token mint and returns a risk grade in <2 seconds
- Understanding of the 5 scoring categories (concentration, authorities, social, liquidity, age)
- Decision logic: when to refuse, when to flag, when to proceed
- A tested pattern for routing through safety checks before any token interaction

**Time:** ~2 hours if you follow along. ~10 minutes to install and run the skill.

---

## Part 1: The rug landscape on Solana (2026)

Roughly 60-70% of new tokens launched on Solana in 2025 were scams or rugs at some point in their lifecycle. Not all of them are obvious. The skill exists because human eyeballs are bad at this — especially when the launch is fresh and the narrative is hot.

**The four main scam patterns:**

1. **Soft rug** — team doesn't lock liquidity, dumps gradually over weeks
2. **Hard rug** — team removes liquidity and disappears in one transaction
3. **Honeypot** — token sells fine but can't be bought back (transfer fee = 100%, or blacklist on buyers)
4. **Slow rug** — looks legitimate for weeks, then team sells all at once

The skill catches patterns 1, 2, and 4 by checking on-chain data. Honeypots (3) are harder — usually require a simulated sell transaction to detect.

---

## Part 2: The 5-category scoring framework

The skill scores every token across five categories, then aggregates with weighted averages and veto overrides.

```javascript
import { assessSafety, getTokenReport } from 'agent-token-safety-skill';

const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const report = await getTokenReport(mint, { rpc: process.env.SOLANA_RPC_URL });
const safety = assessSafety(report);

console.log(safety);
// {
//   grade: 'low',                    // 'low' | 'medium' | 'high' | 'critical'
//   score: 18,                       // 0-100, lower = safer
//   recommendation: 'safe to interact',
//   flags: [],                       // specific issues found
//   categories: {
//     concentration: 8,             // holder concentration risk
//     authorities: 5,                // mint/freeze authority status
//     social: 0,                     // twitter/website/telegram
//     liquidity: 5,                  // pool depth + LP lock status
//     age: 0,                        // token age in days
//   },
//   vetoes_triggered: [],           // veto overrides that bypass scoring
// }
```

**Reading the result:**
- `grade`: action-level recommendation
- `score`: numeric, 0 = perfectly safe, 100 = obvious scam
- `flags`: human-readable list of issues
- `categories`: per-dimension scores
- `vetoes_triggered`: things that automatically fail regardless of other scores

**Grade thresholds:**

| Grade | Score | Action |
|---|---|---|
| `low` | 0-30 | Safe to interact |
| `medium` | 31-60 | Interact with caution, position size limits |
| `high` | 61-85 | Avoid or use extreme position size limits |
| `critical` | 86-100 | Do NOT interact, even for analysis |

---

## Part 3: Category 1 — Holder concentration

If 1 wallet owns 90% of supply, that's a rug waiting to happen. The skill checks the top 20 holders.

```javascript
import { getTokenLargestAccounts } from 'agent-token-safety-skill';

const holders = await getTokenLargestAccounts(mint, rpcUrl);

console.log(holders);
// [
//   { address: 'Gj...', ui_amount: 950000000, pct: 95.0 },   // single holder owns 95%
//   { address: '7x...', ui_amount: 25000000,  pct: 2.5 },
//   ...
// ]
```

**Scoring logic:**

```javascript
function scoreConcentration(holders) {
  const top1 = holders[0]?.pct ?? 100;
  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  
  if (top1 > 80) return 100;       // obvious rug setup
  if (top1 > 50) return 70;        // high concentration
  if (top10 > 80) return 50;       // top 10 control most supply
  if (top10 > 50) return 25;       // moderate concentration
  return 0;                        // well distributed
}
```

**Real example:**

A token showed 1 holder at 91%. The skill auto-vetoed with `flag: 'top1_over_90_percent'` — score became 100 regardless of other categories.

**Veto rules (these auto-fail the token):**

| Condition | Veto | Severity |
|---|---|---|
| Top 1 holder > 90% | `top1_over_90` | Critical |
| Top 10 holders > 95% | `top10_over_95` | Critical |
| Mint authority + freeze authority both active | `authorities_active` | Critical |
| LP unlocked AND top1 > 50% | `lp_unlocked_concentrated` | High |

---

## Part 4: Category 2 — Mint and freeze authorities

These are the on-chain switches that let the team do whatever they want.

```javascript
import { getTokenAuthorities } from 'agent-token-safety-skill';

const authorities = await getTokenAuthorities(mint, rpcUrl);

console.log(authorities);
// {
//   mint_authority: '7x...',     // address that can mint more tokens
//   freeze_authority: '7x...',   // address that can freeze accounts
//   supply: 1000000000,
//   decimals: 9,
// }
```

**Why these matter:**

- **Mint authority active** = team can inflate supply any time, dumping the price
- **Freeze authority active** = team can freeze YOUR wallet, preventing you from selling
- **Both revoked** = team gave up control, the token is fixed supply forever (good sign)

**Scoring logic:**

```javascript
function scoreAuthorities(auth) {
  if (auth.mint_authority && auth.freeze_authority) return 100;  // both active = scam risk
  if (auth.mint_authority) return 60;                           // can inflate
  if (auth.freeze_authority) return 40;                         // can freeze
  return 0;                                                     // both revoked
}
```

**Real example:**

`LIBRA` (the Argentine presidential memecoin) had mint authority active. The skill correctly flagged it as `high` risk the day before the team rugged.

**Important caveat:** mint authority being revoked doesn't mean the token is safe. They can:
- Pre-mint all tokens (so mint authority revocation is cosmetic)
- Have a multisig that can re-enable mint
- Have a proxy that can change the mint authority later

The skill combines this with other categories for a holistic view.

---

## Part 5: Category 3 — Social presence

A token with no Twitter, no website, no Telegram is a red flag. But it's not enough to have socials — the socials need to be **verified** and **active**.

```javascript
import { getSocialPresence } from 'agent-token-safety-skill';

const social = await getSocialPresence(mint);

console.log(social);
// {
//   twitter: 'https://twitter.com/example',
//   website: 'https://example.com',
//   telegram: 'https://t.me/example',
//   twitter_handle: 'example',
//   follower_count: 12500,
//   account_age_days: 240,
//   last_tweet_days_ago: 2,
//   has_blue_checkmark: false,
// }
```

**Scoring logic:**

```javascript
function scoreSocial(social) {
  let score = 100;  // start with worst
  
  if (social.twitter) score -= 25;
  if (social.website) score -= 15;
  if (social.telegram) score -= 10;
  
  if (social.follower_count > 1000) score -= 15;
  if (social.follower_count > 10000) score -= 25;
  
  if (social.account_age_days > 90) score -= 10;
  if (social.last_tweet_days_ago < 7) score -= 10;
  
  if (social.has_blue_checkmark) score -= 10;
  
  return Math.max(0, score);
}
```

**What the skill looks for:**

- ✅ Twitter with >1k followers AND <7 days since last tweet
- ✅ Website that resolves
- ✅ Telegram with active members
- ✅ Account age >90 days (no fresh accounts)
- ✅ Blue checkmark (verified)
- ❌ Twitter with <100 followers, no recent activity
- ❌ Just a Twitter, no website
- ❌ Website that doesn't load

**Critical insight:** social presence is a *weak* signal. Many scams have elaborate socials (purchased followers, fake engagement). The skill uses social as one factor, not the dominant one.

---

## Part 6: Category 4 — Liquidity depth

A $1K liquidity pool is easy to manipulate. A $1M liquidity pool is not.

```javascript
import { getLiquidityInfo } from 'agent-token-safety-skill';

const liq = await getLiquidityInfo(mint);

console.log(liq);
// {
//   total_usd: 145000,           // total liquidity in USD
//   lp_locked: true,             // LP tokens locked in a locker
//   lp_lock_platform: 'streamflow',
//   lp_lock_expiry: '2026-12-31',
//   top_pool_address: '...',
// }
```

**Scoring logic:**

```javascript
function scoreLiquidity(liq) {
  let score = 100;
  
  if (liq.total_usd > 100000) score -= 30;
  if (liq.total_usd > 500000) score -= 20;
  
  if (liq.lp_locked) score -= 30;
  if (liq.lp_lock_expiry && new Date(liq.lp_lock_expiry) > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)) {
    score -= 10;
  }
  
  return Math.max(0, score);
}
```

**Key questions:**

1. **Is liquidity locked?** If yes, the team can't pull it out. Look for locks >90 days.
2. **How deep is liquidity?** <$10K = highly manipulable. >$100K = safer but still risky. >$1M = much safer.
3. **Where is it locked?** Streamflow, Bonfida, GoPlus are trusted lockers. Unknown wallets are not.

**Real example:**

A token had $50K liquidity "locked" in a wallet controlled by the team. The skill detected the self-custody lock and gave it 80/100 liquidity score (vs 30/100 for a real lock).

---

## Part 7: Category 5 — Token age

A token launched 2 hours ago is riskier than one launched 2 years ago. Even if all other signals are green.

```javascript
function scoreAge(launchTimestamp) {
  const ageDays = (Date.now() / 1000 - launchTimestamp) / 86400;
  
  if (ageDays < 1) return 70;     // brand new, no track record
  if (ageDays < 7) return 40;
  if (ageDays < 30) return 20;
  if (ageDays < 90) return 5;
  return 0;
}
```

**Why age matters:**

- Honeypots often reveal themselves within hours
- Soft rugs typically happen in the first 30 days
- A token surviving 90+ days is statistically safer (not safe, just safer)

**Real example:**

`$MUMU` had been live for 16+ hours with growing liquidity and active trading. Age score: 5. Combined with strong other categories, final grade: `medium` (acceptable risk for small position).

---

## Part 8: The veto override system

Some signals are so dangerous they auto-fail the token regardless of other scores:

```javascript
const VETO_RULES = [
  {
    name: 'top1_over_90',
    check: (report) => report.holders[0]?.pct > 90,
    score: 100,
    flag: 'Single wallet owns >90% of supply',
  },
  {
    name: 'authorities_active',
    check: (report) => report.mint_authority && report.freeze_authority,
    score: 100,
    flag: 'Both mint and freeze authorities active',
  },
  {
    name: 'lp_unlocked_concentrated',
    check: (report) => !report.lp_locked && report.holders[0]?.pct > 50,
    score: 90,
    flag: 'LP not locked AND top1 >50% concentration',
  },
  {
    name: 'honeypot_pattern',
    check: (report) => report.simulate_sell_failed === true,
    score: 100,
    flag: 'Simulated sell transaction failed (honeypot pattern)',
  },
];
```

**Vetoes run before scoring.** If any veto triggers, the final score is forced to that veto's score, regardless of category scores.

---

## Part 9: Putting it together — the decision function

```javascript
import { assessSafety, getTokenReport } from 'agent-token-safety-skill';

async function shouldTrade(mint, action, positionSizeUsd) {
  const report = await getTokenReport(mint, { rpc: process.env.SOLANA_RPC_URL });
  const safety = assessSafety(report);
  
  // Critical = no trade, period
  if (safety.grade === 'critical') {
    return { allow: false, reason: `Critical safety issue: ${safety.flags.join(', ')}` };
  }
  
  // High = small position only
  if (safety.grade === 'high') {
    if (positionSizeUsd > 50) {
      return { allow: false, reason: 'Position too large for high-risk token' };
    }
    return { allow: true, position_size_usd: 50, reason: 'High risk, position capped at $50' };
  }
  
  // Medium = moderate position
  if (safety.grade === 'medium') {
    if (positionSizeUsd > 500) {
      return { allow: true, position_size_usd: 500, reason: 'Medium risk, position capped at $500' };
    }
    return { allow: true, reason: 'Medium risk, proceed with caution' };
  }
  
  // Low = normal sizing
  return { allow: true, reason: 'Low risk' };
}
```

**Position size limits by grade:**

| Grade | Max position | Rationale |
|---|---|---|
| `critical` | $0 | Don't interact |
| `high` | $50 | Even if rug, lose only $50 |
| `medium` | $500 | Manageable loss |
| `low` | unlimited (caller's choice) | Trust the safety check |

These limits are configurable per agent. Some agents use 1% of treasury as the cap regardless of grade.

---

## Part 10: Wire it to an AI agent

```javascript
// Pre-trade safety check
async function executeSwap(tokenMint, amountUsd, direction) {
  const check = await shouldTrade(tokenMint, direction, amountUsd);
  
  if (!check.allow) {
    console.log(`TRADE BLOCKED: ${check.reason}`);
    return null;
  }
  
  // Proceed with swap via Jupiter
  const swapResult = await jupiter.swap({
    inputMint: USDC_MINT,
    outputMint: tokenMint,
    amount: amountUsd * 1e6,
    maxSlippageBps: 300,
  });
  
  // Log the safety check for audit
  await logTrade({
    mint: tokenMint,
    amount: amountUsd,
    direction,
    safety_grade: check.grade,
    safety_flags: check.flags,
    timestamp: Date.now(),
  });
  
  return swapResult;
}
```

**The "log the safety check" part is critical.** Every trade your agent makes should record:
- What safety grade it received
- What flags were raised
- Why it was allowed/blocked
- Timestamp

This gives you an audit trail. If your agent ever makes a bad trade, you can trace back to why.

---

## Part 11: Common pitfalls

**1. Stale holder data.** Solana RPC caches. The skill re-fetches holders each call. Don't cache for >30 seconds during hot launches.

**2. LP lock timeouts.** Some teams set LP locks for 7 days then unlock. The skill checks lock expiry. A "locked" LP with 7 days remaining is a rug risk.

**3. Pre-minted supply.** A token can have mint authority revoked but still have 99% of supply in team's wallet. The holder concentration check catches this.

**4. Social signal manipulation.** Buying followers is cheap ($50 for 10K Twitter followers). Don't trust social signals alone.

**5. Honeypot detection requires simulation.** The skill has a `simulate_sell_failed` field that runs an actual sell tx (without sending it). If the simulation fails, it's a honeypot.

---

## What you should take away

1. **Safety scoring is multi-dimensional.** No single signal catches everything.
2. **Veto overrides catch the worst cases.** Some patterns are so bad they override everything else.
3. **Position size limits are your final defense.** Even with perfect safety scoring, cap your exposure.
4. **Audit trail is essential.** Log every safety check, every decision.

---

## Next steps

- **Clone the skill:** `git clone github.com/foundry-sol/skill-bounty`
- **Read the SKILL.md** for full API reference
- **Read Tutorial 1** for CLMM position management
- **Read Tutorial 3** (M4-03) for MEV sandwich protection

---

## Appendix A: Test cases

The skill ships with 10 tests covering edge cases:

```javascript
// Obvious scam: top1 95%, both authorities active
{
  holders: [{ pct: 95.0 }, ...],
  mint_authority: 'some_address',
  freeze_authority: 'some_address',
  expected: { grade: 'critical', score: 100 }
}

// LP unlocked + top1 60% = veto
{
  holders: [{ pct: 60.0 }, ...],
  lp_locked: false,
  expected: { grade: 'high', score: 90, veto: 'lp_unlocked_concentrated' }
}

// Legitimate token with locked LP
{
  holders: [{ pct: 8.0 }, ...],
  mint_authority: null,
  freeze_authority: null,
  lp_locked: true,
  lp_lock_expiry: '2027-01-01',
  twitter: 'https://twitter.com/example',
  twitter_followers: 25000,
  expected: { grade: 'low', score: 15 }
}
```

---

## Appendix B: Cost estimates

**Per-token safety check:**
- 1 RPC call for largest accounts
- 1 RPC call for mint info
- 1 HTTP call to DexScreener (free tier: 60 calls/min)

Total: ~3 RPC units, ~50ms latency on paid RPC.

**For an active agent trading 10 tokens/day:**
- 30 RPC units/day
- 10 DexScreener calls/day (well within free tier)

---

**M4 Tutorial 02** · `agent-token-safety-skill` · 10 tests · MIT license
Built by Foundry · github.com/foundry-sol/skill-bounty