import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, ChevronRight, ChevronLeft, ChevronDown, CreditCard, Search, Download, ShieldCheck, X, CircleHelp, ExternalLink, LockKeyhole, FileText, SlidersHorizontal, Check, LoaderCircle, AlertCircle, RotateCcw, ReceiptText, UploadCloud, Files, Trash2, FileCheck2 } from 'lucide-react';
import { filterTransactions, formatAmount, sumAmounts, toCsv } from './transactions';
import { mergeStatements } from './statements';
import { demoTransactions } from './demo';
import RewardsCard from './RewardsCard';
import RewardAdjustment, { PaymentBadge } from './RewardAdjustment';
import TrackerDashboard from './TrackerDashboard';
import { loadCachedWorkspace, saveCachedWorkspace } from './local-cache';

const EMPTY_FILTERS = { search: '', direction: 'all', currency: 'all', from: '', to: '', sort: 'newest', sourceId: 'all', account: 'all', category: 'all' };
const CATEGORY = { spend: '消费', credit: '退款 / 入账', repayment: '还款', fee: '费用' };
const shortDate = day => day ? `${day.slice(5, 7)}/${day.slice(8, 10)}` : '未提供';
const isModuleLoadError = message => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(String(message || ''));
const needsModuleRefresh = document => document.errorCode === 'module-load' || isModuleLoadError(document.error);
function Modal({ title, children, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><X size={21}/></button></div>{children}</dialog>;
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [cacheReady, setCacheReady] = useState(false);
  const [cacheError, setCacheError] = useState('');
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [summaryCurrency, setSummaryCurrency] = useState('HKD');
  const [expandedFilters, setExpandedFilters] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [rewardOverrides, setRewardOverrides] = useState({});
  const [promotionSettings, setPromotionSettings] = useState({ worldEnabled: true, diningEnabled: true });
  const [exchangeRate, setExchangeRate] = useState(null);
  const fileInput = useRef(null);
  const docsRef = useRef([]);
  const controller = useRef(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const dragDepth = useRef(0);
  const previewUrls = useRef(new Set());
  const ready = documents.filter(document => document.result);
  const rewardCards = useMemo(() => demo ? [] : documents.filter(document => document.result).flatMap(document => document.result.cards || []), [documents, demo]);
  const merged = useMemo(() => mergeStatements(documents), [documents]);
  const records = demo ? demoTransactions : merged.transactions;
  const hasData = demo || ready.length > 0;
  const currencies = useMemo(() => [...new Set(records.map(t => t.currency))].sort(), [records]);
  const accounts = useMemo(() => [...new Set(records.map(t => t.account).filter(Boolean))].sort(), [records]);
  const filtered = useMemo(() => filterTransactions(records, filters), [records, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice((Math.min(page, pages) - 1) * 10, Math.min(page, pages) * 10);
  const warningCount = ready.reduce((count, document) => count + document.result.warnings.length, 0);
  const currentDocument = documents.find(document => document.id === modal?.documentId);
  const activeFilters = filters.search || filters.direction !== 'all' || filters.currency !== 'all' || filters.from || filters.to || filters.sourceId !== 'all' || filters.account !== 'all' || filters.category !== 'all';
  useEffect(() => {
    let active = true;
    loadCachedWorkspace().then(snapshot => {
      if (!active) return;
      if (snapshot) {
        const restored = (snapshot.documents || []).map(item => ({ ...item,
          file: item.file instanceof File ? item.file : new File([item.file], item.name, { type: 'application/pdf' }),
          status: item.status === 'parsing' || (item.status === 'error' && needsModuleRefresh(item)) ? 'queued' : item.status, progress: '' }));
        docsRef.current = restored;
        setDocuments(restored);
        setRewardOverrides(snapshot.overrides || {});
        setPromotionSettings({ worldEnabled: true, diningEnabled: true, ...(snapshot.settings || {}) });
        if (restored.length) setNotice(`已从本地恢复 ${restored.length} 份结单。`);
      }
    }).catch(() => { if (active) setCacheError('本地缓存不可用；当前页面仍可导入，但刷新后不会保留。');
    }).finally(() => { if (active) setCacheReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!cacheReady || demo) return;
    const timer = setTimeout(() => {
      const snapshot = { documents: documents.map(({ id, file, name, status, result, error, errorCode, sameFile }) => ({ id, file, name, status, result, error, errorCode, sameFile })), overrides: rewardOverrides, settings: promotionSettings };
      saveCachedWorkspace(snapshot).then(() => setCacheError('')).catch(() => setCacheError('本地保存失败；请检查浏览器存储空间。'));
    }, 300);
    return () => clearTimeout(timer);
  }, [cacheReady, documents, rewardOverrides, promotionSettings, demo]);
  useEffect(() => {
    if (!cacheReady || busy.current) return;
    const interrupted = docsRef.current.filter(item => item.status === 'queued');
    if (interrupted.length) void processEntries(interrupted);
  }, [cacheReady]);
  useEffect(() => { if (currencies.length && !currencies.includes(summaryCurrency)) setSummaryCurrency(currencies[0]); }, [currencies, summaryCurrency]);
  useEffect(() => { setPage(current => Math.min(current, pages)); }, [pages]);
  useEffect(() => () => { controller.current?.abort(); previewUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const commitDocuments = next => { docsRef.current = next; setDocuments(next); };
  const updateDocument = (id, patch) => commitDocuments(docsRef.current.map(document => document.id === id ? { ...document, ...patch } : document));
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setPage(1); };
  const changeFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };

  async function processEntries(entries, suppliedPassword) {
    if (busy.current) return;
    busy.current = true; setLoading(true); setDemo(false); setNotice(''); setError('');
    // 用批次序号屏蔽清除操作之前的异步回调，避免旧结果重新写回页面。
    const sequence = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      for (const entry of entries) {
        if (generation.current !== sequence || !docsRef.current.some(document => document.id === entry.id)) continue;
        updateDocument(entry.id, { status: 'parsing', error: '', errorCode: '', progress: '正在读取 PDF…' });
        try {
          // 首次导入才加载 PDF.js，让初始页面免于下载较大的解析器。
          const { readStatement } = await import('./pdf');
          const result = await readStatement(entry.file, {
            sourceId: entry.id, password: suppliedPassword, signal: abort.signal,
            onProgress: (current, total) => { if (generation.current === sequence) updateDocument(entry.id, { progress: `正在解析 ${current} / ${total} 页` }); },
          });
          if (generation.current !== sequence) return;
          const sameFile = docsRef.current.some(document => document.id !== entry.id && document.result?.fingerprint === result.fingerprint);
          updateDocument(entry.id, { result, status: result.warnings.length ? 'review' : 'ready', progress: '', sameFile });
        } catch (problem) {
          if (generation.current !== sequence) return;
          const moduleLoadError = isModuleLoadError(problem.message);
          updateDocument(entry.id, { status: problem.code === 'password' ? 'locked' : 'error', errorCode: moduleLoadError ? 'module-load' : '', error: moduleLoadError ? '页面资源已更新，请刷新后重试解析。' : problem.message || 'PDF 无法读取，请检查文件是否完整。', progress: '' });
        }
      }
    } finally { if (generation.current === sequence) { busy.current = false; setLoading(false); } }
  }
  async function retryDocument(document) {
    if (needsModuleRefresh(document)) {
      try {
        await saveCachedWorkspace({ documents: docsRef.current.map(({ id, file, name, status, result, error, errorCode, sameFile }) => ({ id, file, name, status, result, error, errorCode, sameFile })), overrides: rewardOverrides, settings: promotionSettings });
        window.location.reload();
      } catch { setCacheError('本地保存失败，请重新选择 PDF 结单后重试。'); }
      return;
    }
    void processEntries([document]);
  }
  function importFiles(fileList) {
    const files = [...fileList];
    if (!cacheReady) { setNotice('正在恢复本地结单，请稍后再导入。'); return; }
    if (!files.length) return;
    if (busy.current) { setNotice('正在解析当前批次，完成后可继续添加结单。'); return; }
    if (docsRef.current.length + files.length > 20) { setError('当前页面最多导入 20 份结单，请先移除部分文件。'); return; }
    if ([...docsRef.current.map(document => document.file), ...files].reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) { setError('文件总量超过 100 MB，请减少本批次文件。'); return; }
    const entries = files.map(file => ({ id: crypto.randomUUID(), file, name: file.name, status: 'queued', result: null, error: '' }));
    commitDocuments([...docsRef.current, ...entries]); resetFilters(); void processEntries(entries);
  }
  function clear() {
    generation.current++; controller.current?.abort(); busy.current = false; setLoading(false);
    commitDocuments([]); setDemo(false); setSelected(null); setModal(null); setPassword(''); setRewardOverrides({}); setPromotionSettings({ worldEnabled: true, diningEnabled: true }); setError(''); resetFilters();
    void saveCachedWorkspace({ documents: [], overrides: {}, settings: { worldEnabled: true, diningEnabled: true } }).catch(() => setCacheError('清除本地缓存失败，请检查浏览器存储权限。'));
    previewUrls.current.forEach(url => URL.revokeObjectURL(url)); previewUrls.current.clear();
    setNotice('已清除本地结单和交易数据。');
  }
  function removeDocument(id) {
    commitDocuments(docsRef.current.filter(document => document.id !== id)); resetFilters();
    setNotice('已移除结单，并重新汇总其余文件。');
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `汇丰-Pulse-交易明细${demo ? '-示例' : ''}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`已导出当前筛选的 ${filtered.length} 笔${demo ? '示例' : ''}交易及其来源。`);
  }
  function openOriginal(source) {
    const document = docsRef.current.find(document => document.id === source.sourceId);
    if (!document) return;
    const url = URL.createObjectURL(document.file); previewUrls.current.add(url);
    window.open(`${url}#page=${source.page}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => { URL.revokeObjectURL(url); previewUrls.current.delete(url); }, 60000);
  }

  return <>
    <main className={`container main ${dragging ? 'dragging' : ''}`}
      onDragEnter={event => { event.preventDefault(); if ([...event.dataTransfer.types].includes('Files')) { dragDepth.current++; setDragging(true); } }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); importFiles(event.dataTransfer.files); }}>
      <section className="intro"><div className="intro-copy"><span className="eyebrow">PULSE · 2026 返现账本</span><h1>汇丰 Pulse 返现计算器</h1><p>导入电子结单，查看已锁定的奖赏钱、每月返现和交易记录。</p><div className="intro-actions"><button className="button primary" onClick={() => fileInput.current?.click()} disabled={loading}><UploadCloud size={17}/>导入 PDF 结单</button><button className="button secondary" onClick={() => setModal({ type: 'help' })}>查看使用指南<ArrowRight size={16}/></button></div></div><div className="intro-aside"><span className="intro-orbit"><ShieldCheck size={30}/></span><strong>结单只留在本地</strong><p>PDF 在浏览器中解析并缓存，刷新页面也能继续查看；密码不会保存。</p></div></section>
      <nav className="page-nav" aria-label="页面内容"><a href="#import"><span>01</span><strong>导入结单</strong><small>PDF 与本地缓存</small></a><a href="#progress"><span>02</span><strong>返现进度</strong><small>奖赏钱与卡片规则</small></a><a href="#overview"><span>03</span><strong>交易记录</strong><small>概览与逐笔核对</small></a></nav>
      <input className="sr-only" id="statement-files" aria-label="选择一个或多个 PDF 结单" ref={fileInput} type="file" accept=".pdf,application/pdf" multiple disabled={loading} onChange={event => { importFiles(event.target.files); event.target.value = ''; }}/>
      <div className="workspace"><section className="import-section" id="import" aria-label="导入结单"><div className="section-label"><span>01 / 结单导入</span><p>导入 HSBC Pulse 港币卡电子结单，自动整理交易。</p></div><div className="import-grid">
        <section className="connect-panel import-panel" aria-labelledby="import-title">
          <div className="panel-top"><span className="icon-square"><Files size={23}/></span><span className={`connection-dot ${ready.length && !demo ? 'connected' : ''}`}>{loading ? '正在解析' : cacheError ? '本地保存不可用' : ready.length ? `已保存 ${ready.length} 份` : cacheReady ? '本地缓存已就绪' : '正在恢复'}</span></div>
          <h2 id="import-title">导入 PDF 结单</h2><p className="muted">本地解析并保存在当前浏览器；刷新后可恢复。</p>
          <button className="drop-zone" onClick={() => fileInput.current?.click()} disabled={loading} aria-label="拖入或选择一个或多个 PDF 结单"><UploadCloud size={33} strokeWidth={1.4}/><strong>{dragging ? '松开以导入结单' : '拖放 PDF 结单到这里'}</strong><span>或点击选择文件 · 支持多选</span><small>每份 ≤ 25 MB · 最多 20 份</small></button>
          <button className="button primary query-button" onClick={() => fileInput.current?.click()} disabled={loading}>{loading ? <><LoaderCircle className="spin" size={17}/>正在解析结单</> : <><UploadCloud size={17}/>{documents.length ? '继续添加结单' : '选择 PDF 结单'}<ArrowRight size={18}/></>}</button>
          <p className="import-caption">支持 HSBC Pulse 双币卡文字版电子结单。<br/>扫描件暂不支持，密码结单可在导入后解锁。</p>
          <details className="statement-guide"><summary>如何从 HSBC HK App 保存结单 PDF</summary><ol>
            <li>进入 HSBC HK App，点击顶部「银行卡」。</li>
            <li>切换到「汇丰 Pulse 银联双币钻石卡－港币」。</li>
            <li>点击「电子结单和电子通知书」，打开需要的结单。</li>
            <li>点击右上角「分享」，选择「保存到文件」。</li>
            <li>回到本页，点击「选择 PDF 结单」导入保存的文件。</li>
          </ol></details>
        </section>
        {documents.length > 0 && <section className="file-list" aria-label="已导入文件"><div className="files-heading"><h3>本次结单 <span>{documents.length}</span></h3>{loading && <LoaderCircle className="spin" size={14}/>}</div>{documents.map(document => <div className={`file-item file-${document.status}`} key={document.id}>
          <div className="file-name"><FileText size={15}/><strong title={document.name}>{document.name}</strong><button aria-label={`移除 ${document.name}`} disabled={document.status === 'parsing'} onClick={() => removeDocument(document.id)}><X size={14}/></button></div>
          <p className="file-status">{document.status === 'parsing' ? <><LoaderCircle className="spin" size={12}/>{document.progress}</> : document.status === 'queued' ? '等待解析' : document.status === 'ready' ? <><Check size={12}/>{document.result.transactions.length} 笔 · 结欠核对一致</> : document.status === 'review' ? <><AlertCircle size={12}/>{document.result.transactions.length} 笔 · 需要核对</> : document.status === 'locked' ? <><LockKeyhole size={12}/>需要 PDF 密码</> : <><AlertCircle size={12}/>解析失败</>}</p>
          {document.sameFile && <p className="file-hint">相同文件的交易已合并，未重复计数。</p>}{document.error && <p className="file-error">{document.error}</p>}
          <div className="file-actions">{document.result && <button className="text-button" onClick={() => setModal({ type: 'document', documentId: document.id })}>查看解析报告<ChevronRight size={12}/></button>}{document.status === 'error' && <button className="text-button" disabled={loading} onClick={() => void retryDocument(document)}>{needsModuleRefresh(document) ? '刷新并重试' : '重试解析'}<ChevronRight size={12}/></button>}{document.status === 'locked' && <button className="text-button" disabled={loading} onClick={() => { setPassword(''); setModal({ type: 'password', documentId: document.id }); }}>输入密码<ChevronRight size={12}/></button>}</div>
        </div>)}</section>}
        <section className="privacy-panel"><LockKeyhole size={21}/><h3>您的结单，留在您手中</h3><p>PDF 和交易保存在此浏览器；密码不保存。清除后会删除本地缓存。</p><button className="text-button" onClick={clear}><Trash2 size={13}/>{loading ? '取消并清除本地数据' : '清除本地数据'}<ChevronRight size={14}/></button></section>
      </div></section><div className="content">
        {cacheError && <div className="review-banner" role="status"><AlertCircle size={18}/><p>{cacheError}</p></div>}
        {error && <div className="error-banner" role="alert"><AlertCircle size={20}/><div><strong>无法导入本批次</strong><p>{error}</p></div></div>}
        {notice && <div className="notice" role="status"><Check size={16}/>{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}><X size={15}/></button></div>}
        {!demo && warningCount > 0 && <div className="review-banner" role="status"><AlertCircle size={18}/><p>有 {warningCount} 项解析或结欠核对提示。请在上方结单列表的“解析报告”中核对；未识别的行不会计入汇总。</p></div>}
        {!demo && merged.duplicateCount > 0 && <div className="notice"><Files size={16}/>已合并重复结单中的 {merged.duplicateCount} 笔记录。同一结单内相同金额的多笔交易仍各自保留。</div>}
        <div id="progress" className="section-label"><span>02 / 返现进度</span><p>估算以已导入结单和您确认的活动奖赏为准。</p></div>
        <TrackerDashboard records={records} cards={rewardCards} overrides={rewardOverrides} settings={promotionSettings} onSettingsChange={setPromotionSettings} hkdCnyRate={exchangeRate} hasData={hasData} demo={demo}/>
        <details className="reward-breakdown"><summary>查看每张卡的返现计算明细</summary><RewardsCard records={records} cards={rewardCards} overrides={rewardOverrides} worldEffectiveDate={promotionSettings.worldEnabled === false ? '9999-12-31' : (promotionSettings.worldEffectiveDate || '0000-01-01')} onRateChange={setExchangeRate} hasData={hasData} demo={demo}/></details>
<div className="section-label transaction-label"><span>03 / 交易记录</span><p>从总览进入每一笔消费与退款，核对原始结单。</p></div>
        <section className="overview" id="overview" aria-labelledby="summary-title"><div className="section-heading"><div><h2 id="summary-title">交易概览</h2><p>{demo ? '虚构示例账户 · 2026 年 10 月' : hasData ? `${ready.length} 份结单 · ${new Set(records.map(t => t.statementDate)).size} 个结单日 · 按当前筛选汇总` : '导入结单后，查看您的收支概况'}</p></div><label className="currency-selector"><span className="sr-only">概览币种</span><select value={summaryCurrency} onChange={event => setSummaryCurrency(event.target.value)}>{(currencies.length ? currencies : ['HKD']).map(currency => <option key={currency}>{currency}</option>)}</select><ChevronDown size={13}/></label></div>
          <div className="summary-strip"><div className="summary-cell"><span className="stat-label"><ArrowUpRight size={15}/>支出总额</span><div className="stat-amount"><small>{summaryCurrency}</small>{hasData ? formatAmount(sumAmounts(filtered, 'debit', summaryCurrency), summaryCurrency) : '—'}</div><span className="stat-note">当前筛选 · 含消费及费用</span></div><div className="summary-cell"><span className="stat-label"><ArrowDownLeft size={15}/>入账总额</span><div className="stat-amount"><small>{summaryCurrency}</small>{hasData ? formatAmount(sumAmounts(filtered, 'credit', summaryCurrency), summaryCurrency) : '—'}</div><span className="stat-note">包含还款、退款及其他入账</span></div><div className="summary-cell count-cell"><span className="stat-label"><ReceiptText size={15}/>交易笔数</span><div className="stat-amount">{hasData ? filtered.length : '—'}<small>笔</small></div><span className="stat-note">{hasData ? `共整理 ${records.length} 笔交易` : '等待导入结单'}</span></div></div>
          {currencies.length > 1 && <p className="currency-note">不同币种分别汇总，不做汇率换算。</p>}
        </section>
        <section className="transactions-panel" id="transactions" aria-labelledby="transactions-title"><div className="transaction-heading"><div><h2 id="transactions-title">交易明细<span className="count-badge">{filtered.length}</span></h2><p>{demo ? '虚构数据，仅展示界面功能' : hasData ? '每笔记录都可追溯至原始结单和页码' : '让每一笔收支，都有迹可循'}</p></div><button className="export-button" onClick={exportCsv} disabled={!filtered.length || loading}><Download size={16}/><span>导出 CSV</span></button></div>
          <div className="filter-toolbar"><div className="search-field"><Search size={17}/><input aria-label="搜索交易描述或说明" placeholder="搜索商户、交易描述或说明" value={filters.search} onChange={event => changeFilter('search', event.target.value)}/>{filters.search && <button aria-label="清除搜索" onClick={() => changeFilter('search', '')}><X size={14}/></button>}</div><select aria-label="收支类型" value={filters.direction} onChange={event => changeFilter('direction', event.target.value)}><option value="all">全部收支</option><option value="debit">支出</option><option value="credit">入账</option></select><button className={`filter-button ${expandedFilters ? 'selected' : ''}`} onClick={() => setExpandedFilters(!expandedFilters)} aria-label="筛选" aria-expanded={expandedFilters}><SlidersHorizontal size={16}/><span>筛选</span></button></div>
          {expandedFilters && <div className="advanced-filters"><label>开始日期<input aria-label="开始日期" type="date" value={filters.from} onChange={event => changeFilter('from', event.target.value)} max={filters.to || undefined}/></label><label>结束日期<input aria-label="结束日期" type="date" value={filters.to} onChange={event => changeFilter('to', event.target.value)} min={filters.from || undefined}/></label><label>币种<select aria-label="筛选币种" value={filters.currency} onChange={event => changeFilter('currency', event.target.value)}><option value="all">全部币种</option>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label><label>交易类型<select aria-label="交易类型" value={filters.category} onChange={event => changeFilter('category', event.target.value)}><option value="all">全部类型</option>{Object.entries(CATEGORY).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>来源结单<select aria-label="来源结单" value={filters.sourceId} onChange={event => changeFilter('sourceId', event.target.value)}><option value="all">全部结单</option>{!demo && ready.map(document => <option key={document.id} value={document.id}>{document.name}</option>)}</select></label><label>子账户<select aria-label="子账户" value={filters.account} onChange={event => changeFilter('account', event.target.value)}><option value="all">全部子账户</option>{accounts.map(account => <option key={account}>{account}</option>)}</select></label><button className="text-button reset-filters" onClick={resetFilters}><RotateCcw size={14}/>重置</button></div>}
          {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="filter-error">开始日期不能晚于结束日期。</p>}
          <div className="table-scroll"><table><thead><tr><th><button onClick={() => changeFilter('sort', filters.sort === 'newest' ? 'oldest' : 'newest')}>入账日期<ChevronDown className={filters.sort === 'oldest' ? 'rotate' : ''} size={13}/></button></th><th>交易描述 / 来源</th><th>类型</th><th className="amount-header">金额</th><th><span className="sr-only">查看详情</span></th></tr></thead><tbody>{visible.map(transaction => <tr key={transaction.id}><td className="date-cell">{shortDate(transaction.day)}<span>{transaction.day.slice(0, 4)}</span></td><td><div className="merchant-cell"><span className={`merchant-icon ${transaction.direction === 'credit' ? 'credit-icon' : ''}`}>{transaction.direction === 'credit' ? <ArrowDownLeft size={18}/> : <CreditCard size={17}/>}</span><div><strong>{transaction.description}</strong><span>{transaction.account || '示例账户'}<span className="reference"> · {transaction.sources ? `第 ${transaction.sources[0].page} 页 · ${transaction.statementDate}` : '虚构示例'}</span></span><PaymentBadge transaction={transaction} override={rewardOverrides[transaction.id]} worldEffectiveDate={promotionSettings.worldEnabled === false ? '9999-12-31' : (promotionSettings.worldEffectiveDate || '0000-01-01')}/></div></div></td><td><span className={`status ${transaction.direction === 'credit' ? 'status-credit' : ''}`}>{CATEGORY[transaction.category] || (transaction.direction === 'credit' ? '入账' : '支出')}</span></td><td className={`amount-cell ${transaction.direction === 'credit' ? 'credit-amount' : ''}`}><span>{transaction.direction === 'credit' ? '+' : '−'} {formatAmount(transaction.amount, transaction.currency)}</span><small>{transaction.currency}</small></td><td><button className="row-button" aria-label={`查看 ${transaction.description} 的交易详情`} onClick={() => setSelected(transaction)}><ChevronRight size={17}/></button></td></tr>)}</tbody></table></div>
          {loading && !records.length ? <div className="empty-state" role="status"><LoaderCircle className="spin" size={34}/><h3>正在读取结单</h3><p>逐页提取文字，整理交易并核对结欠。</p></div> : !filtered.length && <div className="empty-state"><span className="empty-illustration"><FileText size={42} strokeWidth={1.2}/><span><Search size={20}/></span></span><h3>{!hasData ? '将结单拖入，即可开始' : activeFilters ? '没有符合条件的交易' : '结单中没有交易记录'}</h3><p>{!hasData ? '支持一次导入多个 PDF，全程在浏览器内解析。' : activeFilters ? '试试其他关键词，或调整筛选条件。' : '已识别结单，请在解析报告中查看核对结果。'}</p>{!hasData ? <button className="text-button" onClick={() => fileInput.current?.click()}>选择 PDF 结单<UploadCloud size={15}/></button> : activeFilters && <button className="text-button" onClick={resetFilters}>清除筛选<RotateCcw size={14}/></button>}</div>}
          <div className="table-footer"><span>{filtered.length ? `第 ${(Math.min(page, pages) - 1) * 10 + 1}–${Math.min(page * 10, filtered.length)} 笔，共 ${filtered.length} 笔` : '暂无记录'}</span><div className="pagination"><button aria-label="上一页" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft size={16}/></button><span>{Math.min(page, pages)} / {pages}</span><button aria-label="下一页" onClick={() => setPage(current => Math.min(pages, current + 1))} disabled={page >= pages}><ChevronRight size={16}/></button></div></div>
        </section>
        <div className="connection-note"><CircleHelp size={17}/><p>解析结果以原始结单为准。CR 记为入账；上期结欠、积分和汇总不会当作交易。<button onClick={() => setModal({ type: 'help' })}>了解解析规则<ChevronRight size={12}/></button></p></div>
      </div></div>
    </main>
    <footer className="footer"><div className="container footer-inner"><p>汇丰 Pulse 返现计算器 · 独立开发，与 HSBC 无隶属或认可关系。<br/>文件仅在本地处理，交易以原始结单为准。</p><button onClick={() => setModal({ type: 'help' })}>使用与隐私说明<ExternalLink size={13}/></button></div></footer>
    {modal?.type === 'help' && <Modal title="使用与隐私说明" onClose={() => setModal(null)}><div className="help-content">
      <h3>1. 导入 PDF 结单</h3><p>在页面顶部的导入区展开「如何从 HSBC HK App 保存结单 PDF」，按步骤保存文件，再拖入本页或点击「选择 PDF 结单」。支持一次导入多份 HSBC Pulse 双币卡英文文字版电子结单；密码文件可在导入后解锁。扫描件和图片暂不支持。</p>
      <h3>2. 查看返现进度</h3><p>导入后按本年已入账交易估算基础奖赏、赏世界、PULSE 专属及内地餐饮等返现。「今年常规返现」分为信用卡消费（基础、PULSE）与最红自主奖赏（默认额外 5X 全分配赏世界，只计额外部分）。内地餐饮默认按已报名、美团按餐饮估算，单独列在规则中，未计入常规返现或已确认奖赏；最终以汇丰登记、商户类别和实际入账为准。「今年活动奖赏」只汇总手动确认的迎新、其他活动与 Reward+。返现估算以银行实际发放为准。</p>
      <h3>2026 奖赏规则速查</h3><div className="help-rule-scroll"><table><thead><tr><th>奖赏</th><th>金额与上限</th><th>主要条件</th></tr></thead><tbody>
        <tr><th>基础奖赏钱</th><td>每 HKD／RMB 250 元获 1 RC；无上限</td><td>合资格信用卡消费，无须报名</td></tr>
        <tr><th>PULSE 内地／澳门</th><td>额外 2%；每半年首 80,000 元，最多 1,600 RC</td><td>云闪付或 Reward+ 二维码、Apple／Google／Samsung Pay 等指定手机付款</td></tr>
        <tr><th>最红自主奖赏</th><td>选「赏世界」额外 5X，即额外 2%；全年首 100,000 元，最多 2,000 RC</td><td>先报名；仅报名生效后符合「海外及中国内地签账」类别的交易</td></tr>
        <tr><th>内地餐饮</th><td>7–12 月额外 3%，每月最多 80 RC，半年最多 480 RC</td><td>先报名；当月内地合资格净签账满 1,200 元，且餐饮商户类别获银行认可</td></tr>
        <tr><th>信用卡迎新</th><td>按个人资格与申请渠道可获不同金额；例：最高 800 RC</td><td>发卡后指定期限内达到签账要求；请按银行实际入账填写</td></tr>
        <tr><th>HSBCPULSE 二维码迎新</th><td>每笔满 HKD／RMB 50 元获 10 RC，最多 28 笔／280 RC</td><td>申请时使用 HSBCPULSE 优惠码；发卡后首 60 日内用指定二维码付款。已获金额填入「其他活动」</td></tr>
        <tr><th>Reward+ 新用户</th><td>一次性 50 RC</td><td>完成活动登记并实际领取后选择「已领取」</td></tr>
      </tbody></table></div>
      <p>上半年内地餐饮另有 3%＋银联额外 2% 的独立规则，每月合计最多 100 RC。一笔消费可以同时符合基础、PULSE、赏世界和餐饮，但各活动分别检查渠道、报名及剩余额度；微信／支付宝普通钱包交易不自动认定为 PULSE 二维码或餐饮合资格交易。基础返现没有封顶，因此不存在固定的「首年总上限」。<a href="https://www.hsbc.com.hk/credit-cards/products/unionpay-dual-currency-diamond/" target="_blank" rel="noopener noreferrer">汇丰 PULSE 产品页</a> · <a href="https://www.redhotoffers.hsbc.com.hk/en/latest-offers/red-hot-overseas-spending-rewards/" target="_blank" rel="noopener noreferrer">内地餐饮活动页</a></p>
      <h3>迎新及其他活动需要自己填写</h3><p>请在返现进度的「已获得的活动奖赏」区域，把已经获得的迎新奖赏 RC 直接填入对应字段，获得 Reward+ 新用户 50 RC 后选择「已领取」；如有其他活动奖赏，可在「其他活动获得 RC」填入已获得金额，避免与迎新及 Reward+ 重复。已确认金额计入「今年活动奖赏」，未确认的奖赏请留空。</p>
      <h3>3. 核对交易概览与明细</h3><p>概览按当前筛选和币种汇总收支；明细可搜索、筛选、打开原始 PDF 核对，并可修正支付方式或餐饮分类。每份结单的「解析报告」会检查子账户结欠；余额一致仍不能保证每笔交易都被正确识别。需要时可导出 CSV。</p>
      <h3>本地缓存与隐私</h3><p>PDF、解析结果和手动设置仅保存在当前浏览器的 IndexedDB，不上传本站服务器；PDF 密码不保存。刷新后可恢复，点击「清除本地数据」或清理浏览器站点数据会删除缓存。公开汇率请求仅查询 HKD/CNY，不包含结单或交易资料；已导出的 CSV 需自行管理。</p>
    </div></Modal>}
    {modal?.type === 'password' && currentDocument && <Modal title="解锁 PDF 结单" onClose={() => { setModal(null); setPassword(''); }}><p className="modal-description">{currentDocument.name}<br/>密码仅用于本次本地解密，不保存或上传。</p><form onSubmit={event => { event.preventDefault(); const value = password; setPassword(''); setModal(null); void processEntries([currentDocument], value); }}><label htmlFor="pdf-password">结单密码</label><input id="pdf-password" type="password" value={password} autoComplete="off" autoFocus required onChange={event => setPassword(event.target.value)}/><button className="button primary full-width" type="submit">解锁并解析<LockKeyhole size={17}/></button></form></Modal>}
    {modal?.type === 'document' && currentDocument?.result && <Modal title="结单解析报告" onClose={() => setModal(null)}><div className="report-summary"><FileCheck2 size={25}/><div><strong>{currentDocument.name}</strong><p>{currentDocument.result.pageCount} 页 · {currentDocument.result.transactions.length} 笔交易 · {currentDocument.result.tablePages} 页交易表</p></div></div>{currentDocument.result.sections.map(section => <div className="reconciliation" key={section.id}><div><strong>{section.currency} ···· {section.last4}</strong><span className={section.status === 'matched' ? 'matched' : 'needs-review'}>{section.status === 'matched' ? '结欠一致' : '需要核对'}</span></div><p>结单日 {section.statementDate} · {section.transactionCount} 笔</p><dl><div><dt>上期结欠</dt><dd>{section.opening ?? '未识别'}</dd></div><div><dt>本期结欠</dt><dd>{section.closing ?? '未识别'}</dd></div><div><dt>核对差额</dt><dd>{section.difference ?? '无法核对'}</dd></div></dl></div>)}{currentDocument.result.warnings.length ? <div className="report-warnings"><h3>请核对以下内容</h3>{currentDocument.result.warnings.map((warning, index) => <div key={index}><p>第 {warning.page} 页：{warning.message}</p>{warning.line && <pre>{warning.line}</pre>}</div>)}</div> : <p className="report-success"><Check size={16}/>已识别子账户的结欠核对一致，仍请与原件核对。</p>}<button className="button secondary full-width" onClick={() => openOriginal({ sourceId: currentDocument.id, page: 1 })}>打开原始结单<ExternalLink size={15}/></button></Modal>}
    {selected && <Modal title="交易详情" onClose={() => setSelected(null)}>{demo && <p className="detail-demo">虚构示例数据</p>}<div className={`detail-amount ${selected.direction === 'credit' ? 'credit-amount' : ''}`}><small>{selected.currency}</small>{selected.direction === 'credit' ? '+' : '−'} {formatAmount(selected.amount, selected.currency)}</div><dl className="detail-list">{[['交易描述', selected.description], ['入账日期', selected.day], ['交易日期', selected.transactionDay || selected.day], ['收支方向', selected.direction === 'credit' ? '入账' : '支出'], ['交易类型', CATEGORY[selected.category] || '示例交易'], ['子账户', selected.account || '虚构示例'], ['结单日期', selected.statementDate || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selected.notes?.length > 0 && <div className="source-text"><h3>交易续行说明</h3>{selected.notes.map((note, index) => <p key={index}>{note}</p>)}</div>}<RewardAdjustment transaction={selected} value={rewardOverrides[selected.id]} onChange={value => setRewardOverrides(current => ({ ...current, [selected.id]: value }))}/>{selected.rawLine && <div className="source-text"><h3>结单原始文字</h3><pre>{selected.rawLine}</pre></div>}{selected.sources?.map(source => <button className="source-button" key={source.sourceId} onClick={() => openOriginal(source)}><FileText size={16}/><span>{source.fileName}<small>第 {source.page} 页 · 点击查看原件</small></span><ExternalLink size={14}/></button>)}<p className="detail-note">金额、日期和方向以原始结单为准。</p></Modal>}
  </>;
}
