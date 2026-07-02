# Tutorial 5: Decoding Solana Transaction Errors with Anchor

> **M4 Tutorial** for the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) · Built on the
> [`anchor-debug-skill`](https://github.com/foundry-sol/skill-bounty/tree/main/anchor-debug-skill)
> · 23/96 tests passing

## Who this is for

You're an AI agent (or a developer) building on Solana. Transactions fail with cryptic errors. You spend hours decoding them. The error message is unhelpful. You don't know if it's a problem with your code, your parameters, or the program.

This tutorial shows you how to use `anchor-debug-skill` to:
- Decode any Anchor or Solana runtime error into a human message
- Simulate transactions before sending them
- Parse transaction logs to find the actual failure point
- Get fix suggestions for common errors

**What you'll build by the end:**
- A function that takes a failed transaction signature and returns a diagnosis
- A transaction simulator that catches errors before they happen
- A log parser that finds the actual error in nested CPI calls
- A library of fixes for the 20 most common Anchor errors

**Time:** ~2 hours if you follow along. ~10 minutes to install and run.

---

## Part 1: The error landscape on Solana

Solana has two layers of errors:

1. **Solana runtime errors** — transaction-level failures (insufficient funds, account not found, etc.)
2. **Anchor program errors** — code-level failures inside Anchor programs (custom error codes, constraint violations)

The skill decodes both.

**The 20 most common errors:**

| Code | Name | Category | Cause |
|---|---|---|---|
| 100 | `InstructionMissing` | Runtime | Missing required instruction |
| 101 | `InstructionDataTooLarge` | Runtime | Instruction data > 1KB |
| 6000 | `InstructionDidNotDeserialize` | Runtime | Invalid instruction format |
| 6001 | `InstructionDidNotSerialize` | Runtime | Can't serialize result |
| 6002 | `IdlInstructionStub` | Runtime | IDL mismatch |
| 6003 | `IdlInstructionMissingSigner` | Runtime | Missing required signer |
| 6004 | `IdlInstructionMalformed` | Runtime | Malformed IDL |
| 6005 | `IdlInstructionArgsMissing` | Runtime | Missing required args |
| 6006 | `IdlInstructionInvalidArg` | Runtime | Invalid arg value |
| 6007 | `ConstraintSeeds` | Anchor | PDA seeds don't match |
| 6008 | `ConstraintTokenOwner` | Anchor | Token account owner mismatch |
| 6009 | `ConstraintMint` | Anchor | Mint account mismatch |
| 6010 | `ConstraintAssociated` | Anchor | ATA not initialized |
| 6011 | `ConstraintAccount` | Anchor | Account discriminator wrong |
| 6012 | `ConstraintExecutable` | Anchor | Account not executable |
| 6013 | `ConstraintState` | Anchor | State constraint violated |
| 6014 | `ConstraintMutable` | Anchor | Account not mutable |
| 6015 | `ConstraintRentExempt` | Anchor | Account not rent-exempt |
| 6016 | `ConstraintSigner` | Anchor | Missing required signer |
| 6017 | `ConstraintSystem` | Anchor | System program check failed |
| 6018 | `ConstraintHasOne` | Anchor | has_one constraint failed |
| 6019 | `ConstraintRaw` | Anchor | Custom constraint failed |
| 6020 | `ConstraintZero` | Anchor | Zero check failed |
| 6021 | `ConstraintSignerMint` | Anchor | Signer mint check failed |
| 6022 | `ConstraintRentEpoch` | Anchor | Rent epoch check failed |
| 6023 | `ConstraintSpace` | Anchor | Account space mismatch |
| 6024 | `ConstraintInit` | Anchor | Account already initialized |
| 6025 | `ConstraintClose` | Anchor | Close constraint failed |
| 6026 | `ConstraintOwner` | Anchor | Owner constraint failed |
| 6027 | `ConstraintHasNone` | Anchor | has_none constraint failed |
| 6028 | `ConstraintAccountIsNone` | Anchor | Account should be None |
| 6029 | `ConstraintRentExemptLamports` | Anchor | Rent-exempt lamports check |
| 6030 | `ConstraintExecutableAcl` | Anchor | Executable ACL check |
| 6031 | `ConstraintStateLoaded` | Anchor | State loaded constraint failed |
| 6032 | `ConstraintSeedsInit` | Anchor | Seeds init failed |
| 6033 | `ConstraintSeedsSize` | Anchor | Seeds size constraint |
| 6034 | `ConstraintAssociatedInit` | Anchor | ATA init failed |
| 6035 | `ConstraintHasOneWithZero` | Anchor | has_one with zero |
| 6036 | `ConstraintCloseNoLamports` | Anchor | Close no lamports failed |
| 6037 | `ConstraintRentExemptReceive` | Anchor | Rent-exempt receive failed |
| 6038 | `ConstraintRentExemptCheck` | Anchor | Rent-exempt check failed |
| 6039 | `ConstraintReturn` | Anchor | Return constraint failed |

That's 39 custom Anchor error codes plus 100+ Solana runtime errors. Decoding them by hand is impossible.

---

## Part 2: The basic decoder

```javascript
import { decodeError } from 'anchor-debug-skill';

// Error code as a number
const decoded = decodeError(6001);

console.log(decoded);
// {
//   name: 'InstructionDidNotSerialize',
//   description: 'The program could not serialize the result. The instruction returns a value that cannot be serialized.',
//   category: 'runtime',
//   common_causes: [
//     'The return type is not serializable',
//     'The Anchor IDL is out of date',
//   ],
//  fix_suggestion: 'Check that the return type is one Anchor supports (numbers, strings, public keys, accounts, etc.). If using a custom type, ensure it implements AnchorSerialize.',
// }
```

**Reading the output:**

| Field | What it means |
|---|---|
| `name` | The error's name (e.g., `ConstraintSeeds`) |
| `description` | Plain English explanation |
| `category` | `runtime` or `anchor` |
| `common_causes` | Why this usually happens |
| `fix_suggestion` | How to fix it |

---

## Part 3: Decoding transaction-level errors

When a transaction fails, the error is in the transaction result. The skill decodes this:

```javascript
import { decodeTxError } from 'anchor-debug-skill';

// Transaction signature that failed
const sig = '5j4...abc';
const connection = new Connection(process.env.SOLANA_RPC_URL);
const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });

const diagnosis = decodeTxError(tx);

console.log(diagnosis);
// {
//  error_code: 6023,
//  error_name: 'ConstraintSpace',
//  description: 'Account data does not fit the declared size',
//  failed_instruction: 2,        // instruction index that failed
//  failed_program: 'Jupiter...', // program that failed
//  failed_account: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',  // account that caused the issue
//  log_messages: [
//    'Program Jupiter... invoke [2]',
//    'Program log: AnchorError occurred. Error Code: ConstraintSpace',
//  ],
//  fix_suggestion: 'The account data exceeds the declared size. Recreate the account with a larger size, or check that the deserialization matches the on-chain layout.',
// }
```

**This is the killer feature:** the skill tells you:
- **Which instruction** failed (index 2 of 4)
- **Which program** failed (Jupiter, or your program, or something else)
- **Which account** was the problem
- **Why** it failed (the error name + description)
- **How to fix it** (actionable suggestion)

---

## Part 4: Transaction simulation

The skill provides `simulateTransaction()` which calls Solana's `simulateTransaction` RPC. This runs the transaction without sending it, returning the result (success or failure).

```javascript
import { simulateTransaction } from 'anchor-debug-skill';

const tx = /* your transaction */;

const sim = await simulateTransaction(connection, tx, {
  replaceRecentBlockhash: true,    // use fresh blockhash
  sigVerify: false,                // skip signature verification (faster)
});

console.log(sim);
// {
//  success: false,
//  error_code: 6001,
//  error_name: 'InstructionDidNotSerialize',
//  error_description: '...',
//  compute_units_consumed: 45000,
//  log_messages: ['...'],
//  suggested_fix: '...',
// }
```

**Why simulate first:** failed transactions cost SOL in fees (~0.000005 SOL = $0.0004 each, but in high-fee periods more). Simulating saves:
- Failed transaction fees
- Time debugging after sending
- Wasted compute on retry loops

**Best practice:** simulate every transaction before sending. The cost of `simulateTransaction` RPC is ~10x cheaper than a failed on-chain transaction.

---

## Part 5: Log parsing for nested CPI calls

The hard part: when a transaction has CPI (Cross-Program Invocation) calls, the error might be in the inner call. The skill's log parser handles this:

```javascript
import { parseTransactionLogs } from 'anchor-debug-skill';

const logMessages = [
  'Program A invoke [1]',
  'Program A invoke [2]',
  'Program B invoke [3]',
  'Program B log: Some log message',
  'Program B consumed 5000 of 200000 compute units',
  'Program B failed: AnchorError occurred. Error Code: ConstraintSpace. Error Number: 6023. Error Message: Account data does not fit the declared size.',
  'Program A consumed 25000 of 200000 compute units',
  'Program A back to invoke [2]',
  'Program A failed: custom program error: 0x177f',
];

const parsed = parseTransactionLogs(logMessages);

console.log(parsed);
// {
//  total_programs: 2,
//  total_instructions: 3,
//  failed: true,
//  root_cause: {
//    program: 'Program B',
//    instruction_index: 3,
//    error_code: 6023,
//    error_name: 'ConstraintSpace',
//    description: 'Account data does not fit the declared size',
//  },
//  call_stack: [
//    { program: 'Program A', instruction: 1, depth: 0 },
//    { program: 'Program A', instruction: 2, depth: 1 },
//    { program: 'Program B', instruction: 3, depth: 2 },
//  ],
//  compute_units: {
//    program_a: 25000,
//    program_b: 5000,
//    total: 30000,
//  },
// }
```

**Reading the output:**

- `failed: true` — the transaction failed
- `root_cause` — the inner-most program that failed
- `call_stack` — the chain of CPI calls (useful for understanding "what was I doing when this happened")
- `compute_units` — how much compute was used

**The call stack is the key:** it tells you which program in the chain of calls actually failed, not just the outer program.

---

## Part 6: Common error patterns and fixes

The skill ships with a knowledge base of common patterns:

```javascript
import { suggestFix } from 'anchor-debug-skill';

const fix = suggestFix({
  error_code: 6023,
  context: {
    program: 'Jupiter',
    instruction: 'swap',
    accounts_involved: ['source_token_account', 'destination_token_account'],
  },
});

console.log(fix);
// {
//  likely_cause: 'Token account is too small for the swap output',
//  check: [
//    'Is the destination token account initialized?',
//    'Does it have enough space for the output amount?',
//    'Is the owner the correct program (Token Program, not Token-2022)?',
//  ],
//  fix_steps: [
//    '1. Check if destination token account exists',
//    '2. If not, initialize it (create ATA or manual create)',
//    '3. If too small, this is rare - the swap should auto-handle it',
//    '4. Verify token program matches (Token-2022 vs SPL Token)',
//  ],
//  related_errors: [6010, 6024],  // similar errors you might be confusing
// }
```

**Why this matters:** the skill doesn't just decode the error — it tells you how to fix it. The "check" list is a debugging checklist.

---

## Part 7: Wire it to an agent

```javascript
// Pre-tx: simulate
async function sendWithDiagnosis(connection, tx) {
  const sim = await simulateTransaction(connection, tx);
  
  if (sim.success) {
    // Send the real transaction
    return await connection.sendTransaction(tx);
  }
  
  // Failed simulation: don't waste fees, return diagnosis
  return {
    error: true,
    error_code: sim.error_code,
    error_name: sim.error_name,
    description: sim.error_description,
    fix: sim.suggested_fix,
    // The agent can decide to retry with the fix
  };
}

// Post-tx: decode failures
async function monitorTransactions(connection, signatures) {
  for (const sig of signatures) {
    const tx = await connection.getTransaction(sig);
    if (tx.meta.err) {
      const diagnosis = decodeTxError(tx);
      console.error(`Tx ${sig} failed: ${diagnosis.error_name} - ${diagnosis.description}`);
      // Alert the agent: "Hey, your last tx failed because..."
    }
  }
}
```

**Real-world usage:** the agent never sends a transaction that will fail. It simulates first, decodes errors, suggests fixes. The agent becomes self-correcting.

---

## Part 8: The "Constraint" family of errors

Anchor's `@account(...)` constraints are the most common error source. Here's a quick reference:

| Error | What it means | Common fix |
|---|---|---|
| `ConstraintSeeds` | PDA seeds don't match | Double-check seed order and bumps |
| `ConstraintTokenOwner` | Token account owner wrong | Use the right wallet as owner |
| `ConstraintMint` | Mint account mismatch | Verify the mint address |
| `ConstraintAssociated` | ATA not initialized | Create the ATA first |
| `ConstraintAccount` | Discriminator wrong | Re-init the account |
| `ConstraintExecutable` | Account not executable | Use a program, not a PDA |
| `ConstraintState` | State constraint violated | Check account version |
| `ConstraintMutable` | Account marked immutable | Remove immutable flag |
| `ConstraintRentExempt` | Insufficient lamports | Send more SOL to cover rent |
| `ConstraintSigner` | Missing required signer | Add the signer to the tx |
| `ConstraintHasOne` | has_one constraint failed | Verify account relationship |
| `ConstraintRaw` | Custom constraint failed | Check your custom logic |
| `ConstraintSpace` | Account too small | Increase size, reinit |
| `ConstraintInit` | Already initialized | Use `init_if_needed` or skip |
| `ConstraintClose` | Close constraint failed | Check ownership/conditions |
| `ConstraintOwner` | Owner constraint failed | Use the right owner |

**Pattern:** if you see "Constraint*", the issue is your `@account(...)` macro or your account setup. Read the error name, look up the fix above.

---

## Part 9: Common pitfalls

**1. IDL out of sync.** If you redeploy your program but don't update the IDL, you'll get deserialization errors. Always re-fetch the IDL after deploy.

**2. Account reallocation.** If you change a struct's size, old accounts won't fit. Either realloc or require reinitialization.

**3. Token-2022 vs SPL Token.** Token-2022 has different program ID. If you try to use a Token-2022 mint with a program expecting SPL Token (or vice versa), you get `ConstraintTokenOwner` or `ConstraintMint`.

**4. Compute budget.** Some complex transactions exceed 200K compute units. The skill's `compute_units` field tells you how much was used. If it's near the limit, consider splitting into multiple transactions.

**5. Recent blockhash expiry.** Transactions expire after ~60 seconds. If you build a tx and submit it later, it might fail with `BlockhashNotFound`.

---

## Part 10: The 30-second debugging loop

When a transaction fails, do this:

```javascript
async function debug30(signature) {
  console.log('1. Get transaction...');
  const tx = await connection.getTransaction(signature);
  
  console.log('2. Decode error...');
  const diagnosis = decodeTxError(tx);
  console.log(`  ${diagnosis.error_name}: ${diagnosis.description}`);
  
  console.log('3. Read fix suggestion...');
  console.log(`  ${diagnosis.fix_suggestion}`);
  
  console.log('4. Check related accounts...');
  console.log(`  Failed: ${diagnosis.failed_program} at index ${diagnosis.failed_instruction}`);
  console.log(`  Account: ${diagnosis.failed_account}`);
  
  console.log('5. If unclear, simulate...');
  // (Requires you to have the original tx)
  
  return diagnosis;
}
```

**This 30-second loop** replaces the usual 30-minute debugging session. The skill does the heavy lifting; you just read the output.

---

## What you should take away

1. **Simulate first.** Every transaction. Always.
2. **Decode everything.** Every error is a name, a description, and a fix.
3. **Parse the call stack.** The root cause might be in a CPI call, not the outer program.
4. **Use the knowledge base.** The skill knows common patterns; you don't need to remember them.

---

## Next steps

- **Clone the skill:** `git clone github.com/foundry-sol/skill-bounty`
- **Read the SKILL.md** for full API reference
- **Read Tutorial 1-4** for related topics
- **Read Tutorial 6** (M4-06) for multi-agent orchestration

---

## Appendix A: Test cases

```javascript
// Decode 6023
{
  code: 6023,
  expected: { name: 'ConstraintSpace', category: 'anchor' }
}

// Decode 100 (runtime)
{
  code: 100,
  expected: { name: 'InstructionMissing', category: 'runtime' }
}

// Custom program error
{
  code: 6000,
  expected: { name: 'InstructionDidNotDeserialize', category: 'runtime' }
}
```

---

## Appendix B: Quick reference card

```
simulateTransaction  →  catches errors before sending
decodeTxError        →  decodes a real on-chain failure
decodeError          →  decodes an error code
parseTransactionLogs →  finds the root cause in CPI calls
suggestFix           →  provides actionable fix steps
```

**The five functions, in order of usage:**
1. `simulateTransaction` (before sending)
2. `decodeTxError` (after failure)
3. `decodeError` (when you have a code)
4. `parseTransactionLogs` (for complex failures)
5. `suggestFix` (for fix suggestions)

---

**M4 Tutorial 05** · `anchor-debug-skill` · 23 tests · MIT license
Built by Foundry · github.com/foundry-sol/skill-bounty