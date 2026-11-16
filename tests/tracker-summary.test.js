import test from 'node:test';
import assert from 'node:assert/strict';
import { trackerSummary } from '../src/tracker-summary.js';
import { rewardMoney } from '../src/rewards.js';

const meal = { id: 'meal', day: '2026-10-10', transactionDay: '2026-10-09', description: 'MEITUAN CHN CN', merchantCountryCode: 'CN', amount: '1200.00', currency: 'CNY', direction: 'debit', category: 'spend', notes: ['APPLE PAY'] };
const summarize = (records, settings = {}) => trackerSummary(records, { today: '2026-11-11', settings });

test('dashboard keeps estimated Meituan dining outside received card rewards', () => {
  const result = summarize([meal]);
  assert.equal(rewardMoney(result.locked), '52.80');
  assert.equal(rewardMoney(result.cardTotal), '52.80');
  assert.equal(rewardMoney(result.creditSpendTotal), '28.80');
  assert.equal(rewardMoney(result.choiceTotal), '24.00');
  assert.equal(rewardMoney(result.regularTotal), '52.80');
  assert.equal(rewardMoney(result.activityTotal), '0.00');
  assert.equal(rewardMoney(result.qualifiedSpend), '1200.00');
  assert.equal(rewardMoney(result.promotions.diningCashback), '36.00');
  assert.equal(rewardMoney(result.remaining), '3712.00');
  assert.equal(result.rules.length, 8);
  const qrRule = result.rules.find(rule => rule.name === '二维码小奖赏');
  assert.equal(qrRule.rate, '单笔 ≥50 · 28 次 × 10 RC');
  assert.equal(qrRule.earned, 0n);
  assert.equal(qrRule.used, 0n);
  assert.equal(qrRule.cap, 28n);
  assert.deepEqual(result.monthly.map(row => [row.month, rewardMoney(row.creditSpend), rewardMoney(row.choice)]), [['2026-10', '28.80', '24.00']]);
  assert.equal(rewardMoney(result.monthly[0].regularTotal), '52.80');
  assert.deepEqual(result.monthly.map(row => [row.month, rewardMoney(row.mainlandSpend), rewardMoney(row.diningSpend), row.diningQualified]), [['2026-10', '1200.00', '1200.00', true]]);
});

test('monthly dining shows spending below the threshold and uses transaction month', () => {
  const records = [
    { ...meal, id: 'oct-meal', transactionDay: '2026-10-31', day: '2026-11-02', amount: '500.00' },
    { ...meal, id: 'oct-shop', transactionDay: '2026-10-20', day: '2026-10-21', description: 'EXAMPLE SHOP CHN CN', amount: '600.00' },
    { ...meal, id: 'nov-meal', transactionDay: '2026-11-03', day: '2026-11-04', amount: '200.00' },
    { ...meal, id: 'nov-shop', transactionDay: '2026-11-05', day: '2026-11-06', description: 'EXAMPLE SHOP CHN CN', amount: '1000.00' },
  ];
  const result = summarize(records);
  assert.deepEqual(result.monthly.map(row => [row.month, rewardMoney(row.mainlandSpend), rewardMoney(row.diningSpend), row.diningQualified]), [
    ['2026-10', '1100.00', '500.00', false],
    ['2026-11', '1200.00', '200.00', true],
  ]);
  assert.equal(rewardMoney(result.promotions.diningCashback), '6.00');
});

test('turning world off removes that bonus while custom welcome and Reward+ are separate', () => {
  const off = summarize([meal], { worldEnabled: false, diningEnabled: false });
  assert.equal(rewardMoney(off.locked), '28.80');
  assert.equal(rewardMoney(off.creditSpendTotal), '28.80');
  assert.equal(rewardMoney(off.choiceTotal), '0.00');
  const welcome = summarize([meal], { confirmedWelcomeRc: '350', rewardPlusReceived: true });
  assert.equal(rewardMoney(welcome.promotions.welcomeCashback), '350.00');
  assert.equal(rewardMoney(welcome.locked), '452.80');
  assert.equal(rewardMoney(welcome.cardTotal), '52.80');
  assert.equal(rewardMoney(welcome.regularTotal), '52.80');
  assert.equal(rewardMoney(welcome.activityTotal), '400.00');
});

test('manually confirmed other activity rewards increase locked RC without inflating remaining cap', () => {
  const result = summarize([meal], { confirmedOtherRc: '80' });
  assert.equal(rewardMoney(result.locked), '132.80');
  assert.equal(rewardMoney(result.remaining), '3712.00');
  assert.equal(rewardMoney(result.promotions.otherCashback), '80.00');
  assert.equal(rewardMoney(result.regularTotal), '52.80');
  assert.equal(rewardMoney(result.activityTotal), '80.00');
});

test('confirmed activity rewards remain visible without imported statements', () => {
  const result = summarize([], { confirmedWelcomeRc: '300', confirmedOtherRc: '25', rewardPlusReceived: true });
  assert.equal(rewardMoney(result.cardTotal), '0.00');
  assert.equal(rewardMoney(result.creditSpendTotal), '0.00');
  assert.equal(rewardMoney(result.choiceTotal), '0.00');
  assert.equal(rewardMoney(result.regularTotal), '0.00');
  assert.equal(rewardMoney(result.activityTotal), '375.00');
});

test('monthly displayed amounts reconcile with the rounded annual total', () => {
  const dates = ['2026-01-10', '2026-02-10', '2026-04-10'];
  const records = dates.map((day, index) => ({ ...meal, id: `small-${index}`, day, transactionDay: day, description: 'EXAMPLE SHOP CHN CN', amount: '1.11', notes: ['UNIONPAY'] }));
  const result = trackerSummary(records, { today: '2026-04-30' });
  assert.deepEqual(result.monthly.map(row => [row.month, rewardMoney(row.creditSpend), rewardMoney(row.choice)]), [
    ['2026-01', '0.00', '0.02'],
    ['2026-02', '0.01', '0.02'],
    ['2026-04', '0.00', '0.03'],
  ]);
  assert.equal(rewardMoney(result.monthly.reduce((sum, row) => sum + row.creditSpend, 0n)), rewardMoney(result.creditSpendTotal));
  assert.equal(rewardMoney(result.monthly.reduce((sum, row) => sum + row.choice, 0n)), rewardMoney(result.choiceTotal));
  assert.deepEqual(result.monthly.map(row => rewardMoney(row.regularTotal)), ['0.02', '0.03', '0.03']);
  assert.equal(result.monthly.reduce((sum, row) => sum + row.regularTotal, 0n), result.monthly.reduce((sum, row) => sum + row.creditSpend + row.choice, 0n));
});

test('monthly rewards preserve annual caps and show refund clawbacks in posting month', () => {
  const january = { ...meal, id: 'january', day: '2026-01-15', transactionDay: '2026-01-14', description: 'EXAMPLE SHOP CHN CN', amount: '60000.00', notes: ['UNIONPAY'] };
  const february = { ...january, id: 'february', day: '2026-02-15', transactionDay: '2026-02-14' };
  const refund = { ...january, id: 'refund', day: '2026-03-15', transactionDay: '2026-03-14', direction: 'credit', category: 'credit', amount: '1000.00' };
  const result = trackerSummary([january, february, refund], { today: '2026-03-20' });
  const signed = value => value < 0n ? `-${rewardMoney(-value)}` : rewardMoney(value);
  assert.deepEqual(result.monthly.map(row => [row.month, signed(row.creditSpend), signed(row.choice)]), [
    ['2026-01', '240.00', '1200.00'],
    ['2026-02', '240.00', '800.00'],
    ['2026-03', '-4.00', '-20.00'],
  ]);
  assert.equal(result.monthly.reduce((sum, row) => sum + row.creditSpend, 0n), result.creditSpendTotal);
  assert.equal(result.monthly.reduce((sum, row) => sum + row.choice, 0n), result.choiceTotal);
  assert.deepEqual(result.monthly.map(row => signed(row.regularTotal)), ['1440.00', '1040.00', '-24.00']);
});

test('HKD eligible spend waits for a reference rate instead of fabricating a total', () => {
  const hkd = { ...meal, id: 'hkd', currency: 'HKD', description: 'EXAMPLE SHOP HKG HK', notes: [] };
  const pending = summarize([hkd]);
  assert.equal(pending.locked, null);
  assert.equal(pending.cardTotal, null);
  assert.equal(pending.creditSpendTotal, null);
  assert.equal(pending.choiceTotal, null);
  assert.equal(pending.regularTotal, null);
  assert.equal(rewardMoney(pending.activityTotal), '0.00');
  assert.equal(pending.qualifiedSpend, null);
  const withRate = trackerSummary([hkd], { today: '2026-11-11', hkdCnyRate: 0.85 });
  assert.equal(rewardMoney(withRate.qualifiedSpend), '1020.00');
});
