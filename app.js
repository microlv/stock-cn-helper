const education = [
  ['涨跌幅', '衡量短期价格动量，持续强势通常有趋势资金参与。'],
  ['换手率', '代表交易活跃度。过低流动性不足，过高可能短线博弈激烈。'],
  ['PE(动态)', '估值核心指标之一，不同行业合理区间不同。'],
  ['振幅', '波动大小。振幅过大通常意味着风险更高。'],
  ['行业比较', '同一行业内比较更有效，跨行业直接比PE意义有限。'],
  ['综合评分', '把估值、趋势、活跃度、稳定性合并成可解释打分。'],
];

const industryNorms = {
  银行: { pe: [4, 8] }, 保险: { pe: [6, 15] }, 新能源: { pe: [15, 35] }, 半导体: { pe: [20, 55] },
  白酒: { pe: [16, 36] }, 医药: { pe: [18, 45] }, 医疗服务: { pe: [25, 60] }, 安防: { pe: [12, 30] },
  家电: { pe: [10, 22] }, 消费: { pe: [15, 35] },
};

const weightPresets = {
  balanced: { momentum: 32, valuation: 30, liquidity: 18, stability: 20 },
  growth: { momentum: 45, valuation: 18, liquidity: 22, stability: 15 },
  value: { momentum: 18, valuation: 48, liquidity: 14, stability: 20 },
};

const INDEX_SETS = {
  hs300: ['600519', '000858', '601318', '600036', '300750', '002594', '000333', '601012', '600276', '002415'],
  zz500: ['603986', '688981', '300015', '600887', '601888', '002415', '000333'],
  cy50: ['300750', '300015', '300124', '300274', '300896'],
};

const seedFallback = [
  { code: '600519', name: '贵州茅台', industry: '白酒', price: 1426.19, pct: -0.97, turnover: 0.37, pe: 20.73, amplitude: 2.13 },
  { code: '000858', name: '五粮液', industry: '白酒', price: 102.55, pct: -0.65, turnover: 0.59, pe: 13.88, amplitude: 2.40 },
  { code: '601318', name: '中国平安', industry: '保险', price: 53.22, pct: 0.18, turnover: 0.42, pe: 7.66, amplitude: 1.91 },
  { code: '600036', name: '招商银行', industry: '银行', price: 44.08, pct: -0.09, turnover: 0.51, pe: 6.12, amplitude: 1.70 },
  { code: '300750', name: '宁德时代', industry: '新能源', price: 211.32, pct: 1.55, turnover: 1.66, pe: 24.1, amplitude: 3.91 },
  { code: '002594', name: '比亚迪', industry: '新能源', price: 235.06, pct: 0.88, turnover: 1.12, pe: 25.4, amplitude: 3.11 },
];

let stocks = [];
let analyzed = [];
let allMarketStocks = [];
let snapshotUpdatedAt = null;

const qs = (s) => document.querySelector(s);
const industryFilter = qs('#industry-filter');
const riskProfile = qs('#risk-profile');
const marketScope = qs('#market-scope');
const scoreMin = qs('#score-min');
const scoreMinV = qs('#score-min-v');
const weightsDiv = qs('#weights');

function scorePct(pct) { return Math.max(0, Math.min(100, 50 + pct * 8)); }
function scoreTurnover(v) { if (v <= 0.3) return 35; if (v <= 1.5) return 70; if (v <= 4.5) return 100; if (v <= 8) return 70; return 45; }
function scorePE(pe, industry) {
  if (!pe || pe <= 0) return 45;
  const [min, max] = industryNorms[industry]?.pe || [10, 35];
  if (pe <= min) return 95;
  if (pe <= max) return 95 - ((pe - min) / (max - min)) * 25;
  if (pe <= max * 1.8) return Math.max(25, 70 - ((pe - max) / (max * 0.8)) * 45);
  return 15;
}
function scoreStability(a) { if (a <= 2.5) return 92; if (a <= 5) return 75; if (a <= 8) return 52; return 28; }

function normalizeIndustry(raw) {
  if (!raw) return '其他';
  const s = String(raw);
  if (s.includes('银行')) return '银行'; if (s.includes('保险')) return '保险';
  if (s.includes('半导体') || s.includes('芯片')) return '半导体';
  if (s.includes('新能源') || s.includes('光伏') || s.includes('电池')) return '新能源';
  if (s.includes('白酒') || s.includes('酿酒')) return '白酒';
  if (s.includes('医药') || s.includes('生物')) return '医药';
  if (s.includes('医疗')) return '医疗服务'; if (s.includes('家电')) return '家电';
  if (s.includes('消费') || s.includes('食品')) return '消费'; if (s.includes('安防')) return '安防';
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

function renderWeights() {
  const w = weightPresets[riskProfile.value];
  weightsDiv.innerHTML = Object.entries(w).map(([k, v]) => `<div class="weight-row"><span>${k}</span><b>${v}%</b></div>`).join('');
}

function setupIndustries() {
  const set = ['全部', ...new Set(stocks.map((s) => s.industry))];
  industryFilter.innerHTML = set.map((i) => `<option>${i}</option>`).join('');
}

function analyzeOne(s, w) {
  const sub = { momentum: scorePct(s.pct), valuation: scorePE(s.pe, s.industry), liquidity: scoreTurnover(s.turnover), stability: scoreStability(s.amplitude) };
  const score = Object.entries(w).reduce((a, [k, v]) => a + sub[k] * (v / 100), 0);
  return { ...s, score: +score.toFixed(1), tag: score >= 78 ? 'A 候选' : score >= 66 ? 'B 观察' : 'C 谨慎' };
}

function render() {
  if (!stocks.length) return;
  const w = weightPresets[riskProfile.value];
  analyzed = stocks.map((s) => analyzeOne(s, w)).sort((a, b) => b.score - a.score);

  const industry = industryFilter.value || '全部';
  const min = +scoreMin.value;
  const filtered = analyzed.filter((s) => (industry === '全部' || s.industry === industry) && s.score >= min);

  qs('#tbody').innerHTML = analyzed.slice(0, 1000).map((s) => `<tr><td>${s.code}</td><td>${s.name}</td><td>${s.industry}</td><td>${s.pe > 0 ? s.pe : '-'}</td><td>-</td><td>-</td><td class="${s.pct >= 0 ? 'up' : 'down'}">${s.pct}%</td><td>-</td><td>-</td><td class="score">${s.score}</td></tr>`).join('');

  const top = filtered.slice(0, 10);
  qs('#recommend-list').innerHTML = top.map((s) => `<div class="stock-item"><div><b>${s.name} (${s.code})</b> · ${s.industry}<br/><span class="muted">现价 ${s.price} / 涨跌 ${s.pct}% / 换手 ${s.turnover}% / PE ${s.pe > 0 ? s.pe : '-'}</span></div><div><span class="badge">${s.tag}</span> <b>${s.score}</b></div></div>`).join('') || '<p class="muted">没有符合条件的股票，放宽筛选试试。</p>';

  const stamp = snapshotUpdatedAt ? new Date(snapshotUpdatedAt).toLocaleString() : '本地兜底数据';
  qs('#summary').innerHTML = `<span>样本 ${stocks.length}</span><span>筛选入选 ${filtered.length}</span><span>表格前1000条</span><span>数据时间 ${stamp}</span>`;
}

async function loadSnapshot() {
  const bust = `?v=${Date.now()}`;
  const res = await fetch(`./data/market.json${bust}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('snapshot missing');
  const payload = await res.json();
  const arr = Array.isArray(payload.stocks) ? payload.stocks : [];
  snapshotUpdatedAt = payload.updatedAt || null;
  return arr.map((s) => ({
    code: String(s.code || ''),
    name: s.name || '-',
    industryRaw: s.industryRaw || s.industry || '其他',
    industry: normalizeIndustry(s.industry || s.industryRaw),
    price: +(s.price || 0),
    pct: +(s.pct || 0),
    turnover: +(s.turnover || 0),
    pe: +(s.pe || 0),
    amplitude: +(s.amplitude || 0),
    amountWan: +(s.amountWan || 0),
  })).filter((s) => s.code && s.price > 0);
}

async function applyMarketScope() {
  const v = marketScope.value;
  if (v === 'all') stocks = [...allMarketStocks];
  else {
    const set = new Set(INDEX_SETS[v] || []);
    stocks = allMarketStocks.filter((s) => set.has(s.code));
  }
}

async function refreshAllMarket() {
  qs('#summary').innerHTML = '<span>正在读取市场快照...</span>';
  try {
    allMarketStocks = await loadSnapshot();
    if (!allMarketStocks.length) throw new Error('empty');
  } catch {
    allMarketStocks = [...seedFallback];
    snapshotUpdatedAt = null;
  }
  await applyMarketScope();
  setupIndustries();
  render();
}

function setupLearn() { qs('#learn-cards').innerHTML = education.map(([t, d]) => `<article><h3>${t}</h3><p class="muted">${d}</p></article>`).join(''); }

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/); if (lines.length < 2) return [];
  const header = lines[0].split(',').map((s) => s.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const need = ['code', 'name', 'industry', 'price', 'pct', 'turnover', 'pe', 'amplitude'];
  if (need.some((k) => idx[k] == null)) return [];
  return lines.slice(1).map((row) => {
    const c = row.split(',').map((s) => s.trim());
    return { code: c[idx.code], name: c[idx.name], industryRaw: c[idx.industry], industry: normalizeIndustry(c[idx.industry]), price: +(c[idx.price] || 0), pct: +(c[idx.pct] || 0), turnover: +(c[idx.turnover] || 0), pe: +(c[idx.pe] || 0), amplitude: +(c[idx.amplitude] || 0), amountWan: +(c[idx.amountWan] || 0) };
  }).filter((s) => s.code && s.name);
}

qs('#load-demo').textContent = '刷新数据';
qs('#load-demo').onclick = refreshAllMarket;
qs('#run-analysis').onclick = render;
riskProfile.onchange = () => { renderWeights(); render(); };
marketScope.onchange = async () => { await applyMarketScope(); setupIndustries(); render(); };
industryFilter.onchange = render;
scoreMin.oninput = () => { scoreMinV.textContent = scoreMin.value; render(); };

qs('#csv-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const parsed = parseCSV(await file.text());
  if (!parsed.length) return alert('CSV字段需包含: code,name,industry,price,pct,turnover,pe,amplitude');
  allMarketStocks = parsed; snapshotUpdatedAt = Date.now();
  await applyMarketScope(); setupIndustries(); render();
});

renderWeights();
setupLearn();
refreshAllMarket();
setInterval(refreshAllMarket, 5 * 60 * 1000);
