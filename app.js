const STOCK_UNIVERSE = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '000858', name: '五粮液', industry: '白酒' },
  { code: '601318', name: '中国平安', industry: '保险' },
  { code: '600036', name: '招商银行', industry: '银行' },
  { code: '300750', name: '宁德时代', industry: '新能源' },
  { code: '002594', name: '比亚迪', industry: '新能源' },
  { code: '688981', name: '中芯国际', industry: '半导体' },
  { code: '603986', name: '兆易创新', industry: '半导体' },
  { code: '600276', name: '恒瑞医药', industry: '医药' },
  { code: '300015', name: '爱尔眼科', industry: '医疗服务' },
  { code: '002415', name: '海康威视', industry: '安防' },
  { code: '000333', name: '美的集团', industry: '家电' },
  { code: '601012', name: '隆基绿能', industry: '新能源' },
  { code: '600887', name: '伊利股份', industry: '消费' },
  { code: '601888', name: '中国中免', industry: '消费' },
];

const education = [
  ['涨跌幅', '衡量短期价格动量，持续强势通常有趋势资金参与。'],
  ['换手率', '代表交易活跃度。过低流动性不足，过高可能短线博弈激烈。'],
  ['PE(动态)', '估值核心指标之一，不同行业合理区间不同。'],
  ['量比/成交额', '反映当日资金活跃程度，配合趋势判断更可靠。'],
  ['行业比较', '同一行业内比较更有效，跨行业直接比PE意义有限。'],
  ['综合评分', '把估值、趋势、活跃度、行业权重合并成可解释打分。'],
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
const scoreMin = qs('#score-min');
const scoreMinV = qs('#score-min-v');
const weightsDiv = qs('#weights');

function marketCode(code) {
  if (code.startsWith('6') || code.startsWith('688')) return 'sh' + code;
  return 'sz' + code;
}

function jsonpFetch(url, callbackName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${url}${url.includes('?') ? '&' : '?'}_cb=${callbackName}`;
    script.onerror = () => reject(new Error('网络失败'));
    window[callbackName] = (payload) => {
      resolve(payload);
      delete window[callbackName];
      script.remove();
    };
    document.body.appendChild(script);
  });
}

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

async function fetchRealtimeQuotes() {
  const codes = STOCK_UNIVERSE.map((s) => marketCode(s.code)).join(',');
  const ts = Date.now();
  const url = `https://qt.gtimg.cn/q=${codes}&r=${ts}`;

  const text = await fetch(url, { cache: 'no-store', mode: 'cors' }).then((r) => r.text()).catch(async () => {
    // fallback to JSONP relay for strict browsers/CORS blocks
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const payload = await jsonpFetch(`https://r.jina.ai/http://qt.gtimg.cn/q=${codes}&r=${ts}`, cb).catch(() => null);
    return payload || '';
  });

  const lines = String(text).split(';').map((s) => s.trim()).filter(Boolean);
  const byCode = new Map(STOCK_UNIVERSE.map((s) => [s.code, s]));
  const out = [];

  for (const line of lines) {
    const m = line.match(/v_(?:sh|sz)(\d+)="([^"]+)"/);
    if (!m) continue;
    const code = m[1];
    const raw = m[2].split('~');
    const meta = byCode.get(code);
    if (!meta) continue;

    const price = +(raw[3] || 0);
    const prevClose = +(raw[4] || 0);
    const pct = +(raw[32] || ((price && prevClose) ? (((price - prevClose) / prevClose) * 100).toFixed(2) : 0));
    const pe = +(raw[39] || 0);
    const turnover = +(raw[38] || 0);
    const high = +(raw[33] || price);
    const low = +(raw[34] || price);
    const amplitude = price ? +(((high - low) / price) * 100).toFixed(2) : 0;
    const amountWan = +(raw[37] || 0);

    out.push({ ...meta, price, pct, pe, turnover, amplitude, amountWan });
  }
  return out;
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
  const weights = weightPresets[riskProfile.value];
  analyzed = stocks.map((s) => analyzeOne(s, weights)).sort((a, b) => b.score - a.score);

  const industry = industryFilter.value || '全部';
  const min = +scoreMin.value;
  const filtered = analyzed.filter((s) => (industry === '全部' || s.industry === industry) && s.score >= min);

  qs('#tbody').innerHTML = analyzed.map((s) => `<tr>
    <td>${s.code}</td><td>${s.name}</td><td>${s.industry}</td>
    <td>${s.pe || '-'}</td><td>-</td><td>-</td><td class="${s.pct >= 0 ? 'up' : 'down'}">${s.pct}%</td><td>-</td><td>-</td>
    <td class="score">${s.score}</td></tr>`).join('');

  const top = filtered.slice(0, 5);
  qs('#recommend-list').innerHTML = top.map((s) => `<div class="stock-item"><div><b>${s.name} (${s.code})</b> · ${s.industry}<br/><span class="muted">现价 ${s.price} / 涨跌 ${s.pct}% / 换手 ${s.turnover}% / PE ${s.pe || '-'}</span></div><div><span class="badge">${s.tag}</span> <b>${s.score}</b></div></div>`).join('') || '<p class="muted">没有符合条件的股票，放宽筛选试试。</p>';

  qs('#summary').innerHTML = `<span>实时样本 ${stocks.length}</span><span>入选 ${filtered.length}</span><span>更新时间 ${new Date().toLocaleTimeString()}</span>`;
}

async function refreshData() {
  qs('#summary').innerHTML = '<span>正在拉取实时行情...</span>';
  try {
    stocks = await fetchRealtimeQuotes();
    if (!stocks.length) throw new Error('empty');
    setupIndustries();
    render();
  } catch (e) {
    qs('#summary').innerHTML = '<span>实时接口获取失败，请稍后重试</span>';
  }
}

function setupLearn() {
  qs('#learn-cards').innerHTML = education.map(([t, d]) => `<article><h3>${t}</h3><p class="muted">${d}</p></article>`).join('');
}

qs('#load-demo').textContent = '刷新实时数据';
qs('#load-demo').onclick = refreshData;
qs('#run-analysis').onclick = render;
qs('#apply').onclick = render;
riskProfile.onchange = () => { renderWeights(); render(); };
scoreMin.oninput = () => { scoreMinV.textContent = scoreMin.value; render(); };
qs('#csv-input').style.display = 'none';

renderWeights();
setupLearn();
refreshData();
setInterval(refreshData, 60 * 1000);
