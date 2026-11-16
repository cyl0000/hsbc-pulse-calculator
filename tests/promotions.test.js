import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePromotions } from '../src/promotions.js';
import { calculateRewards, rewardMoney } from '../src/rewards.js';

const item = (id, patch = {}) => ({ id, day: '2026-10-10', transactionDay: '2026-10-09', description: 'EXAMPLE RESTAURANT CHN CN', merchantCountryCode: 'CN', amount: '100.00', currency: 'CNY', direction: 'debit', category: 'spend', notes: ['UNIONPAY QR'], ...patch });
const calculate = (items, settings = {}, overrides = {}) => calculatePromotions(items, { today: '2026-11-11', settings, overrides });

test('dining counts Meituan by default and allows explicit correction', () => {
  const items = [item('a', { amount: '1000.00' }), item('b', { amount: '200.00' })];
  assert.equal(calculate(items, { diningEnabled: false }, { a: { dining: true } }).diningCashback, 0n);
  const settings = { diningRegisteredOn: '2026-10-01' };
  assert.equal(rewardMoney(calculate(items, settings).diningCashback), '0.00');
  assert.equal(rewardMoney(calculate(items, settings, { a: { dining: true } }).diningCashback), '30.00');
  const meituan = item('meituan', { description: 'MEITUAN CHN CN', amount: '1000.00' });
  assert.equal(rewardMoney(calculate([meituan, items[1]]).diningCashback), '30.00');
  assert.equal(calculate([meituan, items[1]], {}, { meituan: { dining: 'no' } }).diningCashback, 0n);
  const refunded = [...items, item('refund', { amount: '50.00', direction: 'credit', category: 'credit' })];
  assert.equal(calculate(refunded, settings, { a: { dining: true } }).diningCashback, 0n);
  const secondMonth = item('nov', { transactionDay: '2026-11-01', amount: '3000.00' });
  assert.equal(rewardMoney(calculate([...items, secondMonth], settings, { a: { dining: true }, nov: { dining: true } }).diningCashback), '110.00');
});

test('dining ignores transactions posted after the selected date', () => {
  const future = item('future', { day: '2026-12-01', transactionDay: '2026-10-09', description: 'MEITUAN CHN CN', amount: '2000.00' });
  assert.equal(calculate([future]).diningCashback, 0n);
});

test('confirmed welcome and other activity amounts count without application dates', () => {
  const result = calculate([], { confirmedWelcomeRc: '650', confirmedOtherRc: '120' });
  assert.equal(rewardMoney(result.welcomeCashback), '650.00');
  assert.equal(rewardMoney(result.otherCashback), '120.00');
  assert.equal(rewardMoney(calculate([], { confirmedOtherRc: '300' }).otherCashback), '300.00');
  assert.equal(rewardMoney(calculate([], { confirmedQrRc: '80' }).otherCashback), '80.00');
  assert.equal(calculate([], { issueDate: '2026-10-01', appliedOn: '2026-09-30', promoCodeUsed: true }).otherCashback, 0n);
  assert.equal(calculate([], { welcomeReward: '650', welcomeTarget: '8000' }).welcomeCashback, 0n);
});

test('wallet payments do not count as dining; Reward+ is separate', () => {
  const settings = { diningRegisteredOn: '2026-10-01', rewardPlusReceived: true };
  const result = calculate([item('wallet', { description: 'ALIPAY CHN CN', notes: [], amount: '9000.00' }), item('apple', { notes: ['APPLE PAY'], amount: '100.00' })], settings, { apple: { dining: true } });
  assert.equal(result.otherCashback, 0n);
  assert.equal(result.diningCashback, 0n);
  assert.equal(rewardMoney(result.rewardPlusCashback), '50.00');
  assert.equal(result.total, 0n);
});

test('world bonus begins only on the supplied effective date', () => {
  const records = [item('old', { transactionDay: '2026-09-30', day: '2026-10-11' }), item('new', { transactionDay: '2026-10-11', day: '2026-10-11' })];
  const rewards = calculateRewards(records, { today: '2026-11-11', worldEffectiveDate: '2026-10-10' });
  assert.equal(rewardMoney(rewards.world.cashback), '2.00');
});


test('first-half mainland dining combines 3% and UnionPay 2%, with monthly caps and quarterly rounding', () => {
  const jan = item('jan', { transactionDay: '2026-01-10', amount: '1200.00', description: 'MEITUAN CHN CN' });
  const feb = item('feb', { transactionDay: '2026-02-10', amount: '1201.00', description: '美团 CHN CN' });
  const result = calculatePromotions([jan, feb]);
  assert.equal(rewardMoney(result.diningCashback), '121.00');
  assert.equal(result.dining.length, 2);
  assert.equal(rewardMoney(result.dining[0].cashback), '60.00');
  assert.equal(rewardMoney(result.dining[1].cashback), '60.05');
  assert.equal(rewardMoney(calculate([jan, feb], { diningRegisteredOnH1: '2026-02-01' }).diningCashback), '61.00');
  assert.equal(calculate([jan, feb], {}, { jan: { dining: 'no' }, feb: { dining: 'no' } }).diningCashback, 0n);
});
