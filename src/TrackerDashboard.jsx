import React, { useMemo } from 'react';
import { ChevronDown, Coins, Gift, TrendingUp, Wallet } from 'lucide-react';
import { hongKongToday, MONEY_SCALE, rewardMoney } from './rewards.js';
import { trackerSummary } from './tracker-summary.js';

const amount = value => value === null ? '—' : rewardMoney(value);
const signedAmount = value => value === null ? '—' : value < 0n ? `−${rewardMoney(-value)}` : rewardMoney(value);
const DINING_THRESHOLD = 1200n * MONEY_SCALE;
const diningStatus = (row, enabled) => !enabled ? '未估算' : row.diningQualified ? '已达标' : `还差 ${amount(DINING_THRESHOLD - row.mainlandSpend)} CNY`;

export default function TrackerDashboard({ records, cards, overrides, settings, onSettingsChange, hkdCnyRate, hasData }) {
  const today = hongKongToday();
  const update = patch => onSettingsChange(current => ({ ...current, ...patch }));
  const summary = useMemo(() => trackerSummary(records, { cards, overrides, settings, today, hkdCnyRate }), [records, cards, overrides, settings, today, hkdCnyRate]);
  return <section className="tracker-dashboard" aria-labelledby="tracker-title">
    <div className="tracker-heading"><div><h2 id="tracker-title">返现进度</h2><p>账单导入后自动更新 · {today.slice(0, 4)} 年累计</p></div></div>
    <p className="tracker-footnote tracker-estimate-note">估算前提：最红自主奖赏按赏世界 5X 计算，美团按餐饮计算。内地餐饮返现单独列示，实际资格以汇丰记录为准。</p>
    <div className="promotions-settings"><h3>已获得的活动奖赏</h3><div className="promotions-fields">
      <div className="promotion-field"><label htmlFor="confirmed-welcome-rc">已获得迎新奖赏 RC</label><div className="promotion-control promotion-amount"><input id="confirmed-welcome-rc" type="number" min="0" step="0.01" value={settings.confirmedWelcomeRc || ''} onChange={event => update({ confirmedWelcomeRc: event.target.value })} placeholder="未获得可留空"/><span>RC</span></div></div>
      <div className="promotion-field"><label htmlFor="reward-plus-status">Reward+ 新用户 50 RC</label><div className="promotion-control promotion-choice"><select id="reward-plus-status" value={settings.rewardPlusReceived ? 'received' : 'not-received'} onChange={event => update({ rewardPlusReceived: event.target.value === 'received' })}><option value="not-received">未领取</option><option value="received">已领取 50 RC</option></select><ChevronDown size={13} aria-hidden="true"/></div></div>
      <div className="promotion-field"><label htmlFor="confirmed-other-rc">其他活动获得 RC</label><div className="promotion-control promotion-amount"><input id="confirmed-other-rc" type="number" min="0" step="0.01" value={settings.confirmedOtherRc ?? settings.confirmedQrRc ?? ''} onChange={event => update({ confirmedOtherRc: event.target.value })} placeholder="未获得可留空"/><span>RC</span></div></div>
    </div><p>只填写已获得的奖赏；同一笔 RC 请勿重复计入。设置保存在此浏览器。</p></div>
    <div className="tracker-metrics">
      <div><Coins size={18}/><span>今年常规返现 <small>估算</small></span><strong>{hasData ? amount(summary.regularTotal) : '—'} <small>RC</small></strong><dl className="tracker-metric-breakdown"><div><dt>信用卡消费</dt><dd>{hasData ? amount(summary.creditSpendTotal) : '—'} RC</dd></div><div><dt>最红自主奖赏</dt><dd>{hasData ? amount(summary.choiceTotal) : '—'} RC</dd></div></dl><p>含基础、PULSE 与赏世界；餐饮返现另列。</p></div>
      <div><Gift size={18}/><span>今年活动奖赏 <small>已确认</small></span><strong>{hasData || summary.activityTotal > 0n ? amount(summary.activityTotal) : '—'} <small>RC</small></strong><dl className="tracker-metric-breakdown"><div><dt>迎新奖赏</dt><dd>{amount(summary.promotions.welcomeCashback)} RC</dd></div><div><dt>其他活动</dt><dd>{amount(summary.promotions.otherCashback)} RC</dd></div><div><dt>Reward+ 新用户</dt><dd>{amount(summary.promotions.rewardPlusCashback)} RC</dd></div></dl></div>
      <div><Wallet size={18}/><span>今年合资格消费</span><strong>{hasData ? amount(summary.qualifiedSpend) : '—'} <small>CNY</small></strong><p>按已导入记录的净额；港币部分按参考汇率折算</p></div>
      <div><TrendingUp size={18}/><span>剩余还能拿（上限）</span><strong>{hasData ? amount(summary.remaining) : '—'} <small>RC</small></strong><p>有封顶活动的理论剩余；不含未确认的手动奖赏</p></div>
    </div>
    <section className="tracker-monthly" aria-labelledby="tracker-monthly-title"><div className="tracker-monthly-heading">
      <div className="tracker-monthly-title-row"><h3 id="tracker-monthly-title">每月返现与餐饮消费</h3><span>今年常规返现 <strong>{hasData ? amount(summary.regularTotal) : '—'} RC</strong></span></div>
      <p>每月合计＝信用卡消费＋最红自主奖赏。返现按入账月统计；餐饮和 1,200 元门槛按交易月统计，餐饮返现未计入合计 RC。</p>
    </div>
      {hasData && summary.monthly.length ? <>
      <div className="tracker-monthly-scroll"><table>
        <thead><tr><th scope="col">月份</th><th scope="col">每月合计 RC</th><th scope="col">信用卡消费</th><th scope="col">最红自主奖赏</th><th scope="col">内地合资格签账</th><th scope="col">内地餐饮消费</th><th scope="col">餐饮门槛</th></tr></thead>
        <tbody>{summary.monthly.map(row => <tr key={row.month}>
          <th scope="row">{Number(row.month.slice(5))} 月</th>
          <td className="tracker-monthly-total">{signedAmount(row.regularTotal)} RC</td>
          <td>{signedAmount(row.creditSpend)} RC</td><td>{signedAmount(row.choice)} RC</td>
          <td>{amount(row.mainlandSpend)} CNY</td><td>{amount(row.diningSpend)} CNY</td>
          <td className={row.diningQualified ? 'tracker-monthly-qualified' : ''}>{diningStatus(row, settings.diningEnabled !== false)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">今年合计</th><td>{amount(summary.regularTotal)} RC</td><td>{amount(summary.creditSpendTotal)} RC</td><td>{amount(summary.choiceTotal)} RC</td><td>{amount(summary.monthly.reduce((sum, row) => sum + row.mainlandSpend, 0n))} CNY</td><td>{amount(summary.monthly.reduce((sum, row) => sum + row.diningSpend, 0n))} CNY</td><td>逐月判断</td></tr></tfoot>
      </table></div>
      <div className="tracker-monthly-cards">{summary.monthly.map(row => <article className="tracker-month-card" key={row.month}>
        <div className="tracker-month-card-top"><h4>{Number(row.month.slice(5))} 月 <small>常规返现</small></h4><strong>{signedAmount(row.regularTotal)} <small>RC</small></strong></div>
        <dl className="tracker-month-rewards"><div><dt>信用卡消费</dt><dd>{signedAmount(row.creditSpend)} RC</dd></div><div><dt>最红自主奖赏</dt><dd>{signedAmount(row.choice)} RC</dd></div></dl>
        <div className="tracker-month-dining"><div><span>内地餐饮消费</span><strong>{amount(row.diningSpend)} <small>CNY</small></strong></div><div><span>内地合资格签账</span><strong>{amount(row.mainlandSpend)} <small>CNY</small></strong></div></div>
        <p className={row.diningQualified ? 'tracker-month-status is-qualified' : 'tracker-month-status'}><span>餐饮门槛</span><strong>{diningStatus(row, settings.diningEnabled !== false)}</strong></p>
      </article>)}</div>
      <p className="tracker-monthly-note">美团默认计入餐饮；其他餐饮可在交易详情标记。月度金额以已导入结单估算。</p>
      </> : <p className="tracker-monthly-empty">{hasData ? '已导入结单中没有今年的入账记录。' : '导入结单后显示月度返现。'}</p>}
    </section>
    <h3 className="tracker-rules-title">卡片规则与进度</h3>
    <div className="tracker-rules">{summary.rules.map((rule, index) => {
      const progress = rule.cap ? Math.min(100, Math.max(0, Number(rule.used || 0n) / Number(rule.cap) * 100)) : null;
      const used = rule.unit === 'qrCount' ? String(rule.used) : amount(rule.used);
      const cap = rule.cap === null ? '无上限' : rule.unit === 'qrCount' ? String(rule.cap) : amount(rule.cap);
      const showValue = hasData || rule.unit === 'manual' || rule.unit === 'qrCount' || rule.name === 'Reward+ 新用户';
      const label = rule.unit === 'manual' ? '已确认' : rule.unit === 'qrCount' ? '发卡首 60 历日已计' : rule.unit === 'estimatedRc' ? '本月估算' : rule.unit === 'rc' ? '本期已返' : '已计入';
      const progressText = rule.unit === 'qrCount' ? `${used} / ${cap} 次` : `${showValue ? used : '—'}${rule.unit === 'manual' ? ' RC' : ` / ${cap}`}`;
      return <React.Fragment key={rule.name}>
        {index === 0 && <h4 className="tracker-rule-group">按账单估算</h4>}
        {index === 4 && <h4 className="tracker-rule-group">需自行核对的活动</h4>}
        <article><div className="tracker-rule-top"><h4>{rule.name}</h4><span>{rule.rate}</span></div><strong>{rule.unit === 'qrCount' ? `¥${amount(rule.earned)}` : showValue ? amount(rule.earned) : '—'} <small>{rule.unit === 'qrCount' ? `${Math.round(progress || 0)}%` : 'RC'}</small></strong><p>{rule.detail}</p><div className="tracker-rule-progress"><span>{label}</span><span>{progressText}</span></div>{progress !== null && <div className="tracker-bar" role="progressbar" aria-label={`${rule.name}进度`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }}/></div>}</article>
      </React.Fragment>;
    })}</div>
    <p className="tracker-footnote">返现依据已导入结单和当前设置估算，仍以银行实发为准。未导入的月份、其他汇丰卡、报名状态、商户编号和退款归属会影响结果；理论剩余不是未来一定可得的奖赏。</p>
  </section>;
}
