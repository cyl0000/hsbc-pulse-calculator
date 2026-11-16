import { calculateRewards, groupRewardCards, hongKongToday, MONEY_SCALE } from './rewards.js';
import { calculatePromotions } from './promotions.js';

const ZERO = 0n;
const FX_SCALE = 10000000000n;
const CENT = MONEY_SCALE / 100n;
const positive = value => value > ZERO ? value : ZERO;
const roundedCents = value => (value + CENT / 2n) / CENT;
const monthlyDisplayedDelta = (current, previous) => current === null || previous === null ? null : (roundedCents(current) - roundedCents(previous)) * CENT;

export function trackerSummary(records, { cards = [], overrides = {}, settings = {}, today = hongKongToday(), hkdCnyRate = null } = {}) {
  const worldEffectiveDate = settings.worldEnabled === false ? '9999-12-31' : settings.worldEffectiveDate || '0000-01-01';
  const groups = groupRewardCards(records, cards);
  const rewards = groups.map(card => calculateRewards(card.records, { today, hkdCnyRate, overrides, worldEffectiveDate }));
  const promotions = calculatePromotions(records, { today, settings, overrides });
  const cardTotal = rewards.some(reward => reward.totalCny === null) ? null : rewards.reduce((sum, reward) => sum + reward.totalCny, ZERO);
  const worldEarned = rewards.reduce((sum, reward) => sum + (reward.world.cashback || ZERO), ZERO);
  const choiceTotal = cardTotal === null ? null : worldEarned;
  const creditSpendTotal = cardTotal === null ? null : cardTotal - worldEarned;
  const regularTotal = cardTotal === null ? null : creditSpendTotal + choiceTotal;
  const activityTotal = promotions.welcomeCashback + promotions.otherCashback + promotions.rewardPlusCashback;
  const locked = regularTotal === null ? null : regularTotal + activityTotal;
  const cnySpend = rewards.reduce((sum, reward) => sum + positive(reward.base.cnyGross - reward.base.cnyRefunds), ZERO);
  const hkdSpend = rewards.reduce((sum, reward) => sum + positive(reward.base.hkdGross - reward.base.hkdRefunds), ZERO);
  const rate = typeof hkdCnyRate === 'number' && Number.isFinite(hkdCnyRate) && hkdCnyRate > 0 ? BigInt(Math.round(hkdCnyRate * Number(FX_SCALE))) : null;
  const qualifiedSpend = hkdSpend && !rate ? null : cnySpend + (rate ? (hkdSpend * rate + FX_SCALE / 2n) / FX_SCALE : ZERO);
  const baseEarned = rewards.reduce((sum, reward) => sum + (reward.base.totalCny || ZERO), ZERO);
  const pulseEarned = rewards.reduce((sum, reward) => sum + reward.pulse.cashback, ZERO);
  const worldRemaining = settings.worldEnabled === false ? ZERO : rewards.reduce((sum, reward) => sum + reward.world.remaining * 2n / 100n, ZERO);
  const pulseRemaining = rewards.reduce((sum, reward) => sum + reward.pulse.remaining * 2n / 100n + (today.slice(5) < '07-01' ? 80000n * MONEY_SCALE * 2n / 100n : ZERO), ZERO);
  const month = today.slice(0, 7);
  const diningThisMonth = promotions.dining.find(item => item.month === month);
  const diningMonthsLeft = settings.diningEnabled === false || today > '2026-12-31' ? 0 : today < '2026-01-01' ? 12 : 12 - Number(today.slice(5, 7)) + 1;
  const firstHalfMonthsLeft = Math.min(diningMonthsLeft, Math.max(0, today < '2026-01-01' ? 6 : 7 - Number(today.slice(5, 7))));
  const diningRemaining = BigInt(firstHalfMonthsLeft * 100 + (diningMonthsLeft - firstHalfMonthsLeft) * 80) * MONEY_SCALE - (diningThisMonth?.cashback || ZERO);
  const remaining = positive(worldRemaining) + positive(pulseRemaining) + positive(diningRemaining);
  const worldUsed = rewards.reduce((sum, reward) => sum + reward.world.used, ZERO);
  const pulseUsed = rewards.reduce((sum, reward) => sum + reward.pulse.used, ZERO);
  const diningByMonth = new Map(promotions.dining.map(item => [item.month, item]));
  const months = [...new Set([
    ...records.map(record => record.day).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && day.startsWith(`${today.slice(0, 4)}-`) && day <= today).map(day => day.slice(0, 7)),
    ...diningByMonth.keys(),
  ])].sort();
  let previousCreditSpend = ZERO, previousChoice = ZERO;
  const monthly = months.map(month => {
    const monthEnd = month === today.slice(0, 7) ? today : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const monthRewards = groups.map(card => calculateRewards(card.records, { today: monthEnd, hkdCnyRate, overrides, worldEffectiveDate }));
    const monthCardTotal = monthRewards.some(reward => reward.totalCny === null) ? null : monthRewards.reduce((sum, reward) => sum + reward.totalCny, ZERO);
    const choiceToDate = monthCardTotal === null ? null : monthRewards.reduce((sum, reward) => sum + reward.world.cashback, ZERO);
    const creditSpendToDate = monthCardTotal === null ? null : monthCardTotal - choiceToDate;
    const dining = diningByMonth.get(month);
    const creditSpend = monthlyDisplayedDelta(creditSpendToDate, previousCreditSpend);
    const choice = monthlyDisplayedDelta(choiceToDate, previousChoice);
    const row = {
      month,
      creditSpend,
      choice,
      regularTotal: creditSpend === null || choice === null ? null : creditSpend + choice,
      mainlandSpend: dining?.spend || ZERO,
      diningSpend: dining?.diningSpend || ZERO,
      diningQualified: dining?.qualified || false,
    };
    previousCreditSpend = creditSpendToDate;
    previousChoice = choiceToDate;
    return row;
  });
  return { locked, qualifiedSpend, remaining, cardTotal, creditSpendTotal, choiceTotal, regularTotal, activityTotal, monthly, promotions, rules: [
    { name: '基础奖赏钱', rate: '0.4%', earned: baseEarned, used: qualifiedSpend, cap: null, detail: '合资格净消费；无上限' },
    { name: '赏世界 5x', rate: '额外 2%', earned: worldEarned, used: worldUsed, cap: BigInt(groups.length) * 100000n * MONEY_SCALE, detail: settings.worldEnabled === false ? '已关闭估算' : '非香港外币交易；年度额度' },
    { name: 'PULSE 专属', rate: '额外 2%', earned: pulseEarned, used: pulseUsed, cap: BigInt(groups.length) * 80000n * MONEY_SCALE, detail: '内地／澳门指定二维码或手机 Pay；普通微信／支付宝钱包付款不计；半年额度 80,000' },
    { name: '内地餐饮（单独估算）', rate: today < '2026-07-01' ? '额外 3%＋2%' : '额外 3%', earned: promotions.diningCashback, used: diningThisMonth?.cashback || ZERO, cap: (today < '2026-07-01' ? 100n : 80n) * MONEY_SCALE, detail: today < '2026-07-01' ? '未计入已获返现；月签账满 1,200，上半年每月最多 100 RC' : '未计入已获返现；月签账满 1,200，下半年每月最多 80 RC', unit: 'estimatedRc' },
    { name: '已获得迎新奖赏', rate: '手动确认', earned: promotions.welcomeCashback, used: promotions.welcomeCashback, cap: null, detail: '填写已获得 RC；留空不计入', unit: 'manual' },
    { name: '二维码小奖赏', rate: '单笔 ≥50 · 28 次 × 10 RC', earned: ZERO, used: ZERO, cap: 28n, detail: '云闪付 / Reward+ 二维码付款；9/28–12/31 批卡专享', unit: 'qrCount' },
    { name: '其他活动奖赏', rate: '手动确认', earned: promotions.otherCashback, used: promotions.otherCashback, cap: null, detail: '填写其他已获得的 RC；避免重复计入', unit: 'manual' },
    { name: 'Reward+ 新用户', rate: '一次性 50 RC', earned: promotions.rewardPlusCashback, used: promotions.rewardPlusCashback, cap: 50n * MONEY_SCALE, detail: '独立账户活动；手动标记已领取', unit: 'rc' },
  ] };
}
