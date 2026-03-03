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

let stocks = [];
let analyzed = [];

const qs = (s) => document.querySelector(s);
const industryFilter = qs('#industry-filter');
const riskProfile = qs('#risk-profile');
const marketScope = qs('#market-scope');
const scoreMin = qs('#score-min');
const scoreMinV = qs('#score-min-v');
const weightsDiv = qs('#weights');

let allMarketStocks = [];

function scorePct(pct) { return Math.max(0, Math.min(100, 50 + pct * 8)); }
function scoreTurnover(v) {
  if (v <= 0.3) return 35;
  if (v <= 1.5) return 70;
  if (v <= 4.5) return 100;
  if (v <= 8) return 70;
  return 45;
}
function scorePE(pe, industry) {
  if (!pe || pe <= 0) return 45;
  const norm = industryNorms[industry]?.pe || [10, 35];
  const [min, max] = norm;
  if (pe <= min) return 95;
  if (pe <= max) return 95 - ((pe - min) / (max - min)) * 25;
  if (pe <= max * 1.8) return Math.max(25, 70 - ((pe - max) / (max * 0.8)) * 45);
  return 15;
}
function scoreStability(amplitude) {
  if (amplitude <= 2.5) return 92;
  if (amplitude <= 5) return 75;
  if (amplitude <= 8) return 52;
  return 28;
}

function jsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = `oc_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const cleanup = () => {
      if (window[cbName]) delete window[cbName];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, timeoutMs);

    window[cbName] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('JSONP network error'));
    };

    // Eastmoney JSONP commonly uses callback=xxx (some envs accept cb=xxx only intermittently)
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cbName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function normalizeIndustry(raw) {
  if (!raw) return '其他';
  const s = String(raw);
  if (s.includes('银行')) return '银行';
  if (s.includes('保险')) return '保险';
  if (s.includes('半导体') || s.includes('芯片')) return '半导体';
  if (s.includes('新能源') || s.includes('光伏') || s.includes('电池')) return '新能源';
  if (s.includes('白酒') || s.includes('酿酒')) return '白酒';
  if (s.includes('医药') || s.includes('生物')) return '医药';
  if (s.includes('医疗')) return '医疗服务';
  if (s.includes('家电')) return '家电';
  if (s.includes('消费') || s.includes('食品')) return '消费';
  if (s.includes('安防')) return '安防';
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

function toStock(item) {
  return {
    code: String(item.f12 || ''),
    name: item.f14 || '-',
    industryRaw: item.f100 || '其他',
    industry: normalizeIndustry(item.f100),
    price: +(item.f2 || 0),
    pct: +(item.f3 || 0),
    turnover: +(item.f8 || 0),
    pe: +(item.f9 || 0),
    high: +(item.f15 || 0),
    low: +(item.f16 || 0),
    amplitude: +(item.f7 || 0),
    amountWan: +(item.f6 || 0),
  };
}

async function fetchMarketPage(pageNo, pageSize = 200) {
  const fs = encodeURIComponent('m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048');
  const fields = 'f12,f14,f100,f2,f3,f6,f7,f8,f9,f15,f16';
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${pageNo}&pz=${pageSize}&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${fields}`;
  const data = await jsonp(url);
  if (!data || !data.data) return { total: 0, items: [] };
  const total = Number(data.data.total || 0);
  const diff = Array.isArray(data.data.diff) ? data.data.diff : [];
  return { total, items: diff.map(toStock).filter((s) => s.code && s.price > 0) };
}

async function fetchAllMarketStocks() {
  const first = await fetchMarketPage(1, 200);
  const total = first.total || first.items.length;
  const pages = Math.max(1, Math.ceil(total / 200));
  const all = [...first.items];
  qs('#summary').innerHTML = `<span>全市场加载中：1/${pages}</span><span>已获取 ${all.length}/${total}</span>`;

  for (let p = 2; p <= pages; p++) {
    try {
      const r = await fetchMarketPage(p, 200);
      all.push(...r.items);
    } catch (e) {
      // 单页失败继续下一页，保证尽可能多拿到数据
    }
    if (p % 3 === 0 || p === pages) {
      qs('#summary').innerHTML = `<span>全市场加载中：${p}/${pages}</span><span>已获取 ${all.length}/${total}</span>`;
    }
  }
  return all;
}

async function fetchIndexConstituents(symbol) {
  const fields = 'f12,f14,f100,f2,f3,f6,f7,f8,f9,f15,f16';
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=800&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=b:${symbol}&fields=${fields}`;
  const data = await jsonp(url);
  const diff = Array.isArray(data?.data?.diff) ? data.data.diff : [];
  return diff.map(toStock).filter((s) => s.code && s.price > 0);
}

async function applyMarketScope() {
  const v = marketScope.value;
  if (v === 'all') {
    stocks = [...allMarketStocks];
    return;
  }
  const map = {
    hs300: 'BK0500', // 沪深300
    zz500: 'BK0701', // 中证500
    cy50: 'BK0800',  // 创业板50
  };
  const symbol = map[v];
  if (!symbol) {
    stocks = [...allMarketStocks];
    return;
  }
  qs('#summary').innerHTML = '<span>正在加载指数成分股...</span>';
  try {
    stocks = await fetchIndexConstituents(symbol);
  } catch {
    stocks = [...allMarketStocks];
  }
}

function analyzeOne(s, weights) {
  const sub = {
    momentum: scorePct(s.pct),
    valuation: scorePE(s.pe, s.industry),
    liquidity: scoreTurnover(s.turnover),
    stability: scoreStability(s.amplitude),
  };
  const score = Object.entries(weights).reduce((acc, [k, w]) => acc + sub[k] * (w / 100), 0);
  const tag = score >= 78 ? 'A 候选' : score >= 66 ? 'B 观察' : 'C 谨慎';
  return { ...s, sub, score: +score.toFixed(1), tag };
}

function renderWeights() {
  const weights = weightPresets[riskProfile.value];
  weightsDiv.innerHTML = Object.entries(weights)
    .map(([k, v]) => `<div class="weight-row"><span>${k}</span><b>${v}%</b></div>`)
    .join('');
}

function setupIndustries() {
  const set = ['全部', ...new Set(stocks.map((s) => s.industry))];
  industryFilter.innerHTML = set.map((i) => `<option>${i}</option>`).join('');
}

function render() {
  if (!stocks.length) return;
  const weights = weightPresets[riskProfile.value];
  analyzed = stocks.map((s) => analyzeOne(s, weights)).sort((a, b) => b.score - a.score);

  const industry = industryFilter.value || '全部';
  const min = +scoreMin.value;
  const filtered = analyzed.filter((s) => (industry === '全部' || s.industry === industry) && s.score >= min);

  qs('#tbody').innerHTML = analyzed.slice(0, 1000).map((s) => `<tr>
    <td>${s.code}</td><td>${s.name}</td><td>${s.industry}</td>
    <td>${s.pe > 0 ? s.pe : '-'}</td><td>-</td><td>-</td><td class="${s.pct >= 0 ? 'up' : 'down'}">${s.pct}%</td><td>-</td><td>-</td>
    <td class="score">${s.score}</td></tr>`).join('');

  const top = filtered.slice(0, 10);
  qs('#recommend-list').innerHTML = top.map((s) => `<div class="stock-item"><div><b>${s.name} (${s.code})</b> · ${s.industry}<br/><span class="muted">现价 ${s.price} / 涨跌 ${s.pct}% / 换手 ${s.turnover}% / PE ${s.pe > 0 ? s.pe : '-'}</span></div><div><span class="badge">${s.tag}</span> <b>${s.score}</b></div></div>`).join('') || '<p class="muted">没有符合条件的股票，放宽筛选试试。</p>';

  qs('#summary').innerHTML = `<span>全市场样本 ${stocks.length}</span><span>筛选入选 ${filtered.length}</span><span>表格展示前 1000 条</span><span>更新时间 ${new Date().toLocaleTimeString()}</span>`;
}

async function refreshAllMarket() {
  qs('#summary').innerHTML = '<span>正在加载全市场股票，请稍候...</span>';
  try {
    allMarketStocks = await fetchAllMarketStocks();
    if (!allMarketStocks.length) throw new Error('empty');
    await applyMarketScope();
    setupIndustries();
    render();
  } catch (e) {
    qs('#summary').innerHTML = '<span>全市场接口获取失败，请稍后重试</span>';
  }
}

function setupLearn() {
  qs('#learn-cards').innerHTML = education.map(([t, d]) => `<article><h3>${t}</h3><p class="muted">${d}</p></article>`).join('');
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((s) => s.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const need = ['code', 'name', 'industry', 'price', 'pct', 'turnover', 'pe', 'amplitude'];
  if (need.some((k) => idx[k] == null)) return [];

  return lines.slice(1).map((row) => {
    const cols = row.split(',').map((s) => s.trim());
    return {
      code: cols[idx.code],
      name: cols[idx.name],
      industryRaw: cols[idx.industry],
      industry: normalizeIndustry(cols[idx.industry]),
      price: +(cols[idx.price] || 0),
      pct: +(cols[idx.pct] || 0),
      turnover: +(cols[idx.turnover] || 0),
      pe: +(cols[idx.pe] || 0),
      amplitude: +(cols[idx.amplitude] || 0),
      amountWan: +(cols[idx.amountWan] || 0),
    };
  }).filter((s) => s.code && s.name);
}

qs('#load-demo').textContent = '刷新全市场数据';
qs('#load-demo').onclick = refreshAllMarket;
qs('#run-analysis').onclick = render;
riskProfile.onchange = () => { renderWeights(); render(); };
marketScope.onchange = async () => { await applyMarketScope(); setupIndustries(); render(); };
industryFilter.onchange = render;
scoreMin.oninput = () => { scoreMinV.textContent = scoreMin.value; render(); };

qs('#csv-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCSV(text);
  if (!parsed.length) {
    alert('CSV字段需包含: code,name,industry,price,pct,turnover,pe,amplitude');
    return;
  }
  stocks = parsed;
  allMarketStocks = parsed;
  setupIndustries();
  render();
});

renderWeights();
setupLearn();
refreshAllMarket();
setInterval(refreshAllMarket, 2 * 60 * 1000);
