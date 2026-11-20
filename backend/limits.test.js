import test from 'node:test';
import assert from 'node:assert/strict';
import { RateBudget, usagePlan } from './limits.js';

test('ten selected assets exceed a single free Worker cron subrequest peak', () => {
  const plan = usagePlan(10);
  assert.equal(plan.node.timeframeRestRequestsPerDay, 9240);
  assert.equal(plan.cloudflareFree.estimatedBinanceSubrequestsPerDay, 38040);
  assert.equal(plan.cloudflareFree.peakSubrequestsPerCron, 120);
  assert.equal(plan.cloudflareFree.fitsSingleCron, false);
});

test('budget stops excess calls and resumes at minute boundary', () => {
  let now = 60_000;
  const budget = new RateBudget({}, () => now);
  budget.perMinute.spot = 3;
  budget.reserve('spot', 2);
  assert.throws(() => budget.reserve('spot', 2), /budget paused/);
  now += 60_000;
  budget.reserve('spot', 2);
  assert.equal(budget.snapshot().spot.minuteWeight, 2);
});

test('429 pauses requests according to Retry-After', () => {
  let now = 60_000;
  const budget = new RateBudget({}, () => now);
  budget.observe('futures', { status: 429, headers: new Headers({ 'retry-after': '120' }) });
  assert.throws(() => budget.reserve('futures', 1), /budget paused/);
  now += 120_000;
  budget.reserve('futures', 1);
});

