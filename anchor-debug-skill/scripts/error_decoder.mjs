#!/usr/bin/env node
/**
 * error_decoder.mjs — Decode Anchor program error codes.
 *
 * Anchor uses numbered error codes (starting at program-derived offset).
 * Common codes:
 *   6000+  - Custom program errors (defined in #[error_code] enum)
 *   100-199 - Account errors
 *   200-299 - Instruction errors
 *   300-399 - IDL errors
 *   1000+ - Misc
 *
 * This module:
 *   - Decodes transaction error codes to human messages
 *   - Maps common Anchor errors to fix suggestions
 *   - Recognizes Solana runtime errors (0x... format)
 */

const ANCHOR_ERRORS = {
  // Instruction errors
  100: { name: 'InstructionMissing', msg: 'A required instruction was not provided', fix: 'Check that you included all required instructions in the transaction' },
  101: { name: 'InstructionFallbackNotFound', msg: 'Instruction fallback function not found', fix: 'Program may need to be redeployed with fallback' },
  102: { name: 'InstructionDidNotDeserialize', msg: 'Failed to deserialize instruction data', fix: 'Check instruction arguments match the IDL' },
  103: { name: 'InstructionDidNotSerialize', msg: 'Failed to serialize instruction data', fix: 'Likely a bug in the program or client' },

  // Account errors
  150: { name: 'AccountMissing', msg: 'A required account was not provided', fix: 'Add the missing account to the transaction' },
  151: { name: 'AccountDidNotDeserialize', msg: 'Failed to deserialize account data', fix: 'Account may be from a different program or have different schema' },
  152: { name: 'AccountDidNotSerialize', msg: 'Failed to serialize account data', fix: 'Account size mismatch — check the IDL' },
  153: { name: 'AccountNotEnoughKeys', msg: 'Not enough accounts provided', fix: 'Add remaining accounts to the transaction' },
  154: { name: 'AccountNotMutable', msg: 'Account is not mutable', fix: 'Account must be marked #[account(mut)]' },
  155: { name: 'AccountNotSigner', msg: 'Account is not a signer', fix: 'Account must be in the signers array' },
  156: { name: 'AccountNotSystemOwned', msg: 'Account is not owned by System Program', fix: 'Account must be initialized via System Program' },
  157: { name: 'AccountNotProgramOwned', msg: 'Account is not owned by the expected program', fix: 'Account must be owned by the program being called' },
  158: { name: 'InvalidProgramId', msg: 'Program ID is invalid', fix: 'Check the program ID matches the deployed program' },
  159: { name: 'InvalidAccountData', msg: 'Account data is invalid', fix: 'Account may be corrupted or have wrong discriminator' },
  160: { name: 'AccountRealloc', msg: 'Account reallocation failed', fix: 'Check the account size matches the IDL' },
  161: { name: 'AccountNotRentExempt', msg: 'Account does not have rent-exempt balance', fix: 'Top up the account with more SOL' },

  // IDL errors
  200: { name: 'IdlInstructionMissing', msg: 'IDL does not define the instruction', fix: 'Program IDL is out of date' },
  201: { name: 'IdlInstructionBytecodeMissing', msg: 'IDL bytecode mismatch', fix: 'Rebuild the IDL from the program source' },
  202: { name: 'IdlAccountMissing', msg: 'IDL does not define the account', fix: 'Program IDL is out of date' },
  203: { name: 'IdlAccountBytecodeMissing', msg: 'IDL account bytecode mismatch', fix: 'Rebuild the IDL' },

  // Constrain seeds
  250: { name: 'ConstraintSeeds', msg: 'PDA seeds mismatch', fix: 'Check the seeds in your #[account(seeds = [...])] derive correctly' },
  251: { name: 'ConstraintSeedsIterator', msg: 'PDA seeds iterator mismatch', fix: 'Check the iterator matches expected seeds' },

  // Require
  300: { name: 'RequireViolated', msg: 'A require!() check failed', fix: 'Check the program logs for which require!() failed' },

  // AccountInfo
  350: { name: 'AccountSysvarMismatch', msg: 'Sysvar account mismatch', fix: 'Pass the correct sysvar account' },

  // State
  1000: { name: 'StateInvalidAddress', msg: 'Invalid state account address', fix: 'Check the account address derivation' },

  // Deprecated
  10001: { name: 'Deprecated', msg: 'This feature is deprecated', fix: 'Update to the latest Anchor version' },
};

/**
 * Common Solana runtime errors (in hex format)
 */
const SOLANA_RUNTIME_ERRORS = {
  '0x0': 'Success',
  '0x1': 'InsufficientFundsForFee',
  '0x2': 'InvalidAccountForFee',
  '0x3': 'DuplicateSignature',
  '0x4': 'BlockhashNotFound',
  '0x5': 'InstructionError',
  '0x6': 'CallChainTooDeep',
  '0x7': 'MissingSignatureForFee',
  '0x8': 'BlockhashTooOld',
  '0x9': 'CallLogTooLong',
  '0xa': 'MissingSignature',
  '0xb': 'AccountInUse',
  '0xc': 'WouldExceedMaxBlockCostLimit',
  '0xd': 'BadBlockhash',
  '0xe': 'AccountNotFound',
};

export function decodeError(code) {
  if (typeof code === 'string') {
    if (code.startsWith('0x')) {
      return SOLANA_RUNTIME_ERRORS[code.toLowerCase()] || `Unknown runtime error: ${code}`;
    }
    // Custom program error string
    return `Custom error: ${code}`;
  }
  if (typeof code === 'number') {
    const info = ANCHOR_ERRORS[code];
    if (info) return { code, ...info };
    // Unknown Anchor error - might be a custom enum
    if (code >= 6000) {
      return {
        code,
        name: 'CustomProgramError',
        msg: `Custom program error code ${code}`,
        fix: 'Check the program source for #[error_code] enum definition',
      };
    }
    return { code, name: 'UnknownError', msg: `Unknown Anchor error: ${code}`, fix: 'Check Anchor docs or program source' };
  }
  return { code, name: 'UnknownError', msg: 'Could not parse error code', fix: 'Provide a number or hex string' };
}

/**
 * Decode a transaction simulation error response.
 */
export function decodeTransactionError(errorResponse) {
  if (!errorResponse) return null;
  // Common Solana error shape:
  // { err: { InstructionError: [index, code] } }
  if (errorResponse.err) {
    const err = errorResponse.err;
    if (typeof err === 'object') {
      // Instruction error
      if (err.InstructionError) {
        const [idx, code] = err.InstructionError;
        const decoded = decodeError(code);
        return {
          type: 'InstructionError',
          instructionIndex: idx,
          ...decoded,
        };
      }
      // Other typed errors
      if (err.InsufficientFundsForFee) return { type: 'InsufficientFundsForFee', msg: 'Account has insufficient SOL for transaction fee' };
      if (err.BlockhashNotFound) return { type: 'BlockhashNotFound', msg: 'Blockhash expired or not found' };
    }
    return { type: 'UnknownTransactionError', msg: JSON.stringify(err) };
  }
  return null;
}

/**
 * Suggest a fix for an Anchor error code.
 */
export function suggestFix(code) {
  const decoded = decodeError(code);
  return decoded.fix || 'No specific fix known';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo
  console.log('Anchor error decoder demo:');
  for (const code of [100, 150, 153, 200, 300, 6000, 9999]) {
    const d = decodeError(code);
    console.log(`  ${code}: ${d.name} - ${d.msg}`);
    console.log(`    Fix: ${d.fix}`);
  }
}