import { test } from 'node:test';
import assert from 'node:assert/strict';
import retry from '../../src/retry.js';

const handlers = () => {
  const calls = { retry: 0, recover: 0, fail: 0 };
  return {
    calls,
    config: {
      delayMs: 1,
      onRetry: () => calls.retry++,
      onRecover: () => calls.recover++,
      onFail: () => {
        calls.fail++;
      },
    },
  };
};

test('retry re-sends only when the send itself throws', async () => {
  const { calls, config } = handlers();
  let sends = 0;

  const result = await retry(async () => {
    if (++sends < 3) {
      throw new Error('network');
    }
    return 'ok';
  }, { ...config, retries: 3 });

  assert.equal(result, 'ok');
  assert.equal(sends, 3);
  assert.deepEqual(calls, { retry: 2, recover: 1, fail: 0 });
});

test('retry with zero retries makes a single attempt and calls onFail', async () => {
  const { calls, config } = handlers();
  let sends = 0;

  await retry(async () => {
    sends++;
    throw new Error('network');
  }, { ...config, retries: 0 });

  assert.equal(sends, 1);
  assert.deepEqual(calls, { retry: 0, recover: 0, fail: 1 });
});
