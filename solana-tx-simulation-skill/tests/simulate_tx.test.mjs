import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseSimulationResult, parseTransaction } from '../scripts/simulate_tx.mjs';

// Mock RPC result structures for testing
function mockSimResult({ err = null, logs = [], units = 5000, returnData = null } = {}) {
  return { value: { err, logs, unitsConsumed: units, returnData } };
}

test('parseSimulationResult: successful tx', () => {
  const r = parseSimulationResult(mockSimResult({
    logs: ['Program 11111111111111111111111111111111 invoke [1]', 'Program 11111111111111111111111111111111 success'],
    units: 4500,
  }), 'base64');
  assert.equal(r.success, true);
  assert.equal(r.verdict, 'would_succeed');
  assert.equal(r.error, null);
  assert.equal(r.compute_units_consumed, 4500);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.log_count, 2);
});

test('parseSimulationResult: failed tx returns error', () => {
  const r = parseSimulationResult(mockSimResult({ err: { InstructionError: [0, 'Custom'] } }), 'base64');
  assert.equal(r.success, false);
  assert.equal(r.verdict, 'would_fail');
  assert.ok(r.error.includes('InstructionError'));
});

test('parseSimulationResult: insufficient funds warning', () => {
  const r = parseSimulationResult(mockSimResult({
    logs: ['Error: insufficient funds for instruction'],
  }), 'base64');
  assert.ok(r.warnings.includes('insufficient funds'));
});

test('parseSimulationResult: compute budget exceeded warning', () => {
  const r = parseSimulationResult(mockSimResult({
    logs: ['Error: compute budget exceeded'],
  }), 'base64');
  assert.ok(r.warnings.includes('compute budget exceeded'));
});

test('parseSimulationResult: slippage exceeded warning', () => {
  const r = parseSimulationResult(mockSimResult({
    logs: ['Error: slippage tolerance exceeded'],
  }), 'base64');
  assert.ok(r.warnings.includes('slippage tolerance exceeded'));
});

test('parseSimulationResult: empty result', () => {
  const r = parseSimulationResult({ value: null }, 'base64');
  assert.equal(r.ok, false);
  assert.equal(r.verdict, 'unknown');
});

test('parseSimulationResult: return data surfaced', () => {
  const r = parseSimulationResult(mockSimResult({
    returnData: { data: Buffer.from('hello').toString('base64'), programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
  }), 'base64');
  assert.equal(r.has_return_data, true);
  assert.equal(r.return_data, 'hello');
});

test('parseSimulationResult: logs are returned verbatim', () => {
  const logs = ['Program A invoke', 'Program A success', 'Program B invoke', 'Program B success'];
  const r = parseSimulationResult(mockSimResult({ logs }), 'base64');
  assert.equal(r.log_count, 4);
  assert.deepEqual(r.logs, logs);
});

test('parseSimulationResult: structured output shape', () => {
  const r = parseSimulationResult(mockSimResult(), 'base64');
  assert.equal(typeof r.success, 'boolean');
  assert.equal(typeof r.verdict, 'string');
  assert.equal(typeof r.compute_units_consumed, 'number');
  assert.equal(typeof r.log_count, 'number');
  assert.ok(Array.isArray(r.warnings));
  assert.ok(Array.isArray(r.logs));
});

test('parseTransaction: invalid base64 throws', () => {
  assert.throws(() => parseTransaction('not-valid-base64!!!'), /decode/);
});

test('parseTransaction: random bytes throw', () => {
  // Random bytes that are valid base64 but invalid transaction
  const random = Buffer.from('hello world not a transaction').toString('base64');
  assert.throws(() => parseTransaction(random));
});

test('parseSimulationResult: multiple warnings on a single tx', () => {
  const r = parseSimulationResult(mockSimResult({
    logs: [
      'Error: insufficient funds for instruction',
      'Error: compute budget exceeded',
    ],
  }), 'base64');
  assert.ok(r.warnings.length >= 2);
  assert.ok(r.warnings.includes('insufficient funds'));
  assert.ok(r.warnings.includes('compute budget exceeded'));
});