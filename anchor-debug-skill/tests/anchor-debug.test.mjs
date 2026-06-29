// tests/anchor-debug.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeError, decodeTransactionError, suggestFix } from '../scripts/error_decoder.mjs';
import { parseLogs, traceInstructions } from '../scripts/tx_simulator.mjs';

const EPS = 1e-9;
function assertApprox(actual, expected, eps = EPS, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg || ''} expected ${expected} ± ${eps}, got ${actual}`);
  }
}

// ============================================================
// error_decoder
// ============================================================

test('decodeError: known Anchor code', () => {
  const d = decodeError(100);
  assert.equal(d.code, 100);
  assert.equal(d.name, 'InstructionMissing');
  assert.ok(d.msg);
  assert.ok(d.fix);
});

test('decodeError: account error 153', () => {
  const d = decodeError(153);
  assert.equal(d.name, 'AccountNotEnoughKeys');
});

test('decodeError: custom program error 6000', () => {
  const d = decodeError(6000);
  assert.equal(d.name, 'CustomProgramError');
  assert.equal(d.code, 6000);
});

test('decodeError: unknown code 9999 returns CustomProgramError', () => {
  // Anchor custom errors are 6000+ from program enum. 9999 is technically a custom code
  // (we just don't know which program). The decoder should identify it as custom.
  const d = decodeError(9999);
  assert.equal(d.name, 'CustomProgramError');
  assert.equal(d.code, 9999);
});

test('decodeError: hex string', () => {
  const d = decodeError('0x5');
  assert.equal(d, 'InstructionError');
});

test('decodeError: hex runtime error 0x4', () => {
  const d = decodeError('0x4');
  assert.equal(d, 'BlockhashNotFound');
});

test('decodeError: invalid input', () => {
  const d = decodeError({ weird: 'object' });
  assert.equal(d.name, 'UnknownError');
});

test('decodeError: hex runtime error 0xe', () => {
  const d = decodeError('0xe');
  assert.equal(d, 'AccountNotFound');
});

test('decodeTransactionError: InstructionError format', () => {
  const err = { err: { InstructionError: [2, 6001] } };
  const decoded = decodeTransactionError(err);
  assert.equal(decoded.type, 'InstructionError');
  assert.equal(decoded.instructionIndex, 2);
  assert.equal(decoded.code, 6001);
});

test('decodeTransactionError: BlockhashNotFound', () => {
  const err = { err: { BlockhashNotFound: 'BlockhashNotFound' } };
  const decoded = decodeTransactionError(err);
  assert.equal(decoded.type, 'BlockhashNotFound');
});

test('decodeTransactionError: null input', () => {
  assert.equal(decodeTransactionError(null), null);
});

test('decodeTransactionError: empty error', () => {
  const decoded = decodeTransactionError({});
  assert.equal(decoded, null);
});

test('suggestFix: returns fix string', () => {
  const fix = suggestFix(150);
  assert.ok(typeof fix === 'string');
  assert.ok(fix.length > 10);
});

// ============================================================
// tx_simulator (parseLogs + traceInstructions)
// ============================================================

test('parseLogs: identifies invoke', () => {
  const parsed = parseLogs(['Program 11111111111111111111111111111111 invoke [1]']);
  assert.equal(parsed[0].type, 'invoke');
  assert.equal(parsed[0].programId, '11111111111111111111111111111111');
  assert.equal(parsed[0].depth, 1);
});

test('parseLogs: identifies log message', () => {
  const parsed = parseLogs(['Program log: Instruction: Transfer']);
  assert.equal(parsed[0].type, 'log');
  assert.equal(parsed[0].message, 'Instruction: Transfer');
});

test('parseLogs: identifies consumed', () => {
  const parsed = parseLogs(['Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 1500 of 200000 compute units']);
  assert.equal(parsed[0].type, 'consumed');
  assert.equal(parsed[0].unitsConsumed, 1500);
  assert.equal(parsed[0].unitsTotal, 200000);
});

test('parseLogs: identifies success', () => {
  const parsed = parseLogs(['Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success']);
  assert.equal(parsed[0].type, 'success');
});

test('parseLogs: identifies data', () => {
  const parsed = parseLogs(['Program data: SGVsbG8=']);
  assert.equal(parsed[0].type, 'data');
  assert.equal(parsed[0].data, 'SGVsbG8=');
});

test('parseLogs: handles empty', () => {
  assert.deepEqual(parseLogs([]), []);
});

test('parseLogs: identifies other', () => {
  const parsed = parseLogs(['Some random log message']);
  assert.equal(parsed[0].type, 'other');
});

test('traceInstructions: simple call tree', () => {
  const logs = [
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4500 of 200000 compute units',
    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
  ];
  const parsed = parseLogs(logs);
  const trace = traceInstructions(parsed);
  assert.equal(trace.calls.length, 1);
  assert.equal(trace.calls[0].program, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(trace.calls[0].unitsConsumed, 4500);
});

test('traceInstructions: nested calls', () => {
  const logs = [
    'Program AAAAAAA invoke [1]',
    'Program AAAAAAA consumed 1000 of 200000 compute units',
    'Program BBBBBBB invoke [2]',
    'Program BBBBBBB consumed 2000 of 200000 compute units',
    'Program BBBBBBB success',
    'Program AAAAAAA success',
  ];
  const parsed = parseLogs(logs);
  const trace = traceInstructions(parsed);
  assert.equal(trace.calls.length, 1);
  const outer = trace.calls[0];
  assert.equal(outer.program, 'AAAAAAA');
  assert.equal(outer.calls.length, 1);
  assert.equal(outer.calls[0].program, 'BBBBBBB');
});

test('traceInstructions: parallel calls', () => {
  const logs = [
    'Program AAAAAAA invoke [1]',
    'Program AAAAAAA consumed 1000 of 200000 compute units',
    'Program AAAAAAA success',
    'Program BBBBBBB invoke [1]',
    'Program BBBBBBB consumed 2000 of 200000 compute units',
    'Program BBBBBBB success',
  ];
  const parsed = parseLogs(logs);
  const trace = traceInstructions(parsed);
  assert.equal(trace.calls.length, 2);
});