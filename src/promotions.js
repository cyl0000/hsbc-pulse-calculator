import { moneyUnits, paymentChannel, rewardExclusionReason, isPendingTransaction } from './rewards.js';

const ZERO = 0n;
const MONEY = 100000n;
const minimum = (a, b) => a < b ? a : b;
const net = value => value > ZERO ? value : ZERO;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const configuredMoney = value => /^\d{1,8}(?:\.\d{1,2})?$/.test(String(value || '')) ? moneyUnits(value) : ZERO;

// These offers are separate from the three ongoing card rewards. No profile detail is inferred from a PDF.
export function calculatePromotions(transactions, { today, settings = {}, overrides = {} } = {}) {
  const year = today?.slice(0, 4) || '2026';
  const diningMonths = new Map();
  const diningFromH1 = validDate(settings.diningRegisteredOnH1) ? settings.diningRegisteredOnH1 : '2026-01-01';
  const diningFromH2 = validDate(settings.diningRegisteredOnH2) ? settings.diningRegisteredOnH2 : validDate(settings.diningRegisteredOn) ? settings.diningRegisteredOn : '2026-07-01';
  const welcomeCashback = configuredMoney(settings.confirmedWelcomeRc);
  const otherCashback = configuredMoney(settings.confirmedOtherRc ?? settings.confirmedQrRc);
  for (const transaction of transactions) {
    const postedDay = transaction.day;
    const day = transaction.transactionDay || postedDay;
    if (!postedDay || postedDay < `${year}-01-01` || postedDay > today || !day || day.slice(0, 4) !== year || day > today || rewardExclusionReason(transaction) || isPendingTransaction(transaction)) continue;
    const override = overrides[transaction.id] || {};
    const channel = paymentChannel(transaction, override.channel, override);
    if (channel.key === 'exclude' || channel.uncertain) continue;
    const amount = moneyUnits(transaction.amount);
    const signed = transaction.direction === 'credit' ? -amount : amount;
    const isWallet = /TENPAY|ALIPAY|WECHAT|WEIXIN/i.test(`${transaction.description || ''} ${transaction.notes?.join(' ') || ''}`) && channel.key === 'standard';
    const diningFrom = day < '2026-07-01' ? diningFromH1 : diningFromH2;
    if (settings.diningEnabled === false || day < diningFrom || day < '2026-01-01' || day > '2026-12-31' || transaction.currency !== 'CNY' || channel.world.region !== 'mainland' || isWallet) continue;
    const month = day.slice(0, 7);
    const group = diningMonths.get(month) || { spend: ZERO, dining: ZERO };
    group.spend += signed;
    // Meituan is a user-requested dining estimate; the bank's merchant category can differ.
    const meituan = /MEITUAN|美团|美團/i.test(transaction.description || '');
    if (override.dining === 'yes' || override.dining === true || (override.dining !== 'no' && meituan)) group.dining += signed;
    diningMonths.set(month, group);
  }
  const dining = [...diningMonths].sort(([a], [b]) => a.localeCompare(b)).map(([month, group]) => {
    const qualified = net(group.spend) >= 1200n * MONEY;
    const firstHalf = month < '2026-07';
    const diningSpend = qualified ? net(group.dining) : ZERO;
    const raw = firstHalf
      ? minimum(diningSpend * 3n / 100n, 60n * MONEY) + minimum(diningSpend * 2n / 100n, 40n * MONEY)
      : minimum(diningSpend * 3n / 100n, 80n * MONEY);
    // Jan–Jun awards are rounded once per quarter; Jul–Dec awards once per month.
    const cashback = firstHalf ? raw : raw ? ((raw + MONEY - 1n) / MONEY) * MONEY : ZERO;
    return { month, spend: net(group.spend), diningSpend: net(group.dining), qualified, cashback };
  });
  const quarters = new Map();
  for (const item of dining) {
    if (item.month >= '2026-07') continue;
    const quarter = item.month <= '2026-03' ? 'Q1' : 'Q2';
    quarters.set(quarter, (quarters.get(quarter) || ZERO) + item.cashback);
  }
  const roundedFirstHalf = [...quarters.values()].reduce((sum, amount) => sum + (amount ? ((amount + MONEY - 1n) / MONEY) * MONEY : ZERO), ZERO);
  const diningCashback = roundedFirstHalf + dining.filter(item => item.month >= '2026-07').reduce((sum, item) => sum + item.cashback, ZERO);
  return { dining, diningCashback, welcomeCashback, otherCashback,
    total: diningCashback + welcomeCashback + otherCashback,
    rewardPlusCashback: settings.rewardPlusReceived ? 50n * MONEY : ZERO,
    incomplete: { dining: settings.diningEnabled === false, welcome: !welcomeCashback, other: !otherCashback }, year };
}
