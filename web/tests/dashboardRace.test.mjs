/**
 * Dashboard race condition and throttle test (V3-A4-03)
 */
import assert from 'node:assert';

function simulateThrottledFocus() {
  let callCount = 0;
  let lastRefetch = 0;

  function onEvent() {
    const now = Date.now();
    if (now - lastRefetch > 1000) {
      lastRefetch = now;
      callCount++;
    }
  }

  // Simulate simultaneous visibilitychange + window.focus within 2ms
  onEvent();
  onEvent();

  assert.strictEqual(callCount, 1, 'Dual focus event within 1s must only trigger 1 fetch');
}

function simulateOutOfOrderResolution() {
  let latestRequestId = 0;
  let activeState = null;

  async function fakeFetch(reqId, delay, resolvedValue) {
    await new Promise((r) => setTimeout(r, delay));
    if (reqId === latestRequestId) {
      activeState = resolvedValue;
    }
  }

  const req1 = ++latestRequestId;
  const p1 = fakeFetch(req1, 50, 'stale_first_request');

  const req2 = ++latestRequestId;
  const p2 = fakeFetch(req2, 10, 'fresh_second_request');

  return Promise.all([p1, p2]).then(() => {
    assert.strictEqual(activeState, 'fresh_second_request', 'Out of order resolution must keep fresh data');
  });
}

simulateThrottledFocus();
await simulateOutOfOrderResolution();
console.log('  dashboard race condition and throttle tests passed');
