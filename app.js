const demoStocks = [
  { code:'600519', name:'贵州茅台', industry:'白酒', pe:28, pb:9.8, roe:33, revGrowth:15, debt:21, dividend:1.8 },
  { code:'000858', name:'五粮液', industry:'白酒', pe:22, pb:6.4, roe:28, revGrowth:13, debt:19, dividend:2.1 },
  { code:'601318', name:'中国平安', industry:'保险', pe:8.5, pb:1.0, roe:13, revGrowth:6, debt:84, dividend:5.2 },
  { code:'600036', name:'招商银行', industry:'银行', pe:6.2, pb:0.95, roe:14, revGrowth:7, debt:90, dividend:4.8 },
  { code:'300750', name:'宁德时代', industry:'新能源', pe:24, pb:5.1, roe:22, revGrowth:28, debt:35, dividend:1.1 },
  { code:'002594', name:'比亚迪', industry:'新能源', pe:25, pb:4.8, roe:20, revGrowth:24, debt:42, dividend:0.8 },
  { code:'688981', name:'中芯国际', industry:'半导体', pe:42, pb:2.2, roe:8, revGrowth:19, debt:27, dividend:0.3 },
  { code:'603986', name:'兆易创新', industry:'半导体', pe:35, pb:4.1, roe:11, revGrowth:16, debt:18, dividend:0.6 },
  { code:'600276', name:'恒瑞医药', industry:'医药', pe:38, pb:7.2, roe:18, revGrowth:14, debt:15, dividend:0.5 },
  { code:'300015', name:'爱尔眼科', industry:'医疗服务', pe:47, pb:8.1, roe:17, revGrowth:20, debt:26, dividend:0.4 },
  { code:'002415', name:'海康威视', industry:'安防', pe:19, pb:3.6, roe:21, revGrowth:9, debt:30, dividend:3.0 },
  { code:'000333', name:'美的集团', industry:'家电', pe:13, pb:2.8, roe:24, revGrowth:10, debt:58, dividend:3.6 },
];

const education = [
  ['PE(市盈率)','股价/每股盈利。越高通常代表市场给了更高增长预期。'],
  ['PB(市净率)','股价/每股净资产。金融类常看PB，过高可能估值偏贵。'],
  ['ROE(净资产收益率)','公司用股东钱赚钱的效率，长期高ROE通常是好公司特征。'],
  ['营收增速','增长型行业核心指标，需和利润增速一起看防止“增收不增利”。'],
  ['负债率','高负债在周期下行时压力大，银行保险行业需区别对待。'],
  ['股息率','偏稳健投资会关注，分红持续性比单年数值更重要。'],
];

let stocks = [...demoStocks];
let analyzed = [];

const weightPresets = {
  balanced: { pe:20, pb:12, roe:26, revGrowth:22, debt:10, dividend:10 },
  growth:   { pe:12, pb:10, roe:24, revGrowth:36, debt:8, dividend:10 },
  value:    { pe:30, pb:20, roe:20, revGrowth:10, debt:10, dividend:10 },
};

const industryNorms = {
  '银行': { pe:[4,8], pb:[0.6,1.2], roe:[8,18], revGrowth:[3,10], debt:[80,92], dividend:[3,7] },
  '保险': { pe:[6,15], pb:[0.7,1.8], roe:[8,20], revGrowth:[4,12], debt:[75,90], dividend:[2,7] },
  '新能源': { pe:[15,35], pb:[2,8], roe:[10,28], revGrowth:[10,35], debt:[20,55], dividend:[0,2] },
  '半导体': { pe:[20,50], pb:[1.5,7], roe:[6,20], revGrowth:[8,30], debt:[10,45], dividend:[0,2] },
  '白酒': { pe:[16,35], pb:[3,10], roe:[15,40], revGrowth:[6,20], debt:[10,35], dividend:[1,4] },
  '医药': { pe:[20,45], pb:[3,9], roe:[10,26], revGrowth:[8,24], debt:[10,45], dividend:[0,2] },
  '医疗服务': { pe:[25,55], pb:[4,12], roe:[10,25], revGrowth:[10,28], debt:[15,40], dividend:[0,1.5] },
  '安防': { pe:[12,30], pb:[2,6], roe:[10,28], revGrowth:[4,20], debt:[15,45], dividend:[1,5] },
  '家电': { pe:[10,22], pb:[1.5,5], roe:[10,30], revGrowth:[4,15], debt:[30,70], dividend:[1.5,6] },
};

const qs = (s)=>document.querySelector(s);
const industryFilter = qs('#industry-filter');
const riskProfile = qs('#risk-profile');
const scoreMin = qs('#score-min');
const scoreMinV = qs('#score-min-v');
const weightsDiv = qs('#weights');

function normScore(v, [min,max], preferLow=false){
  if (preferLow) {
    if (v <= min) return 100;
    if (v >= max*1.4) return 0;
    return Math.max(0, 100 - ((v-min)/(max*1.4-min))*100);
  }
  if (v <= min) return 40;
  if (v >= max) return 100;
  return 40 + ((v-min)/(max-min))*60;
}

function analyzeOne(s, weights){
  const n = industryNorms[s.industry] || { pe:[8,30], pb:[1,6], roe:[8,25], revGrowth:[5,25], debt:[20,70], dividend:[0.5,5] };
  const sub = {
    pe: normScore(s.pe, n.pe, true),
    pb: normScore(s.pb, n.pb, true),
    roe: normScore(s.roe, n.roe),
    revGrowth: normScore(s.revGrowth, n.revGrowth),
    debt: normScore(s.debt, n.debt, true),
    dividend: normScore(s.dividend, n.dividend),
  };
  const score = Object.entries(weights).reduce((acc,[k,w])=>acc + sub[k]*(w/100),0);
  const tag = score>=78 ? 'A 候选' : score>=66 ? 'B 观察' : 'C 谨慎';
  return { ...s, sub, score: +score.toFixed(1), tag };
}

function renderWeights(){
  const weights = weightPresets[riskProfile.value];
  weightsDiv.innerHTML = Object.entries(weights).map(([k,v]) => `<div class="weight-row"><span>${k}</span><b>${v}%</b></div>`).join('');
}

function run(){
  const weights = weightPresets[riskProfile.value];
  analyzed = stocks.map(s=>analyzeOne(s,weights)).sort((a,b)=>b.score-a.score);

  const industry = industryFilter.value;
  const min = +scoreMin.value;
  const filtered = analyzed.filter(s => (industry==='全部' || s.industry===industry) && s.score>=min);

  qs('#tbody').innerHTML = analyzed.map(s=>`<tr>
    <td>${s.code}</td><td>${s.name}</td><td>${s.industry}</td>
    <td>${s.pe}</td><td>${s.pb}</td><td>${s.roe}</td><td class="${s.revGrowth>=15?'up':'down'}">${s.revGrowth}</td><td>${s.debt}</td><td>${s.dividend}</td>
    <td class="score">${s.score}</td></tr>`).join('');

  const top = filtered.slice(0,5);
  qs('#recommend-list').innerHTML = top.map(s=>`<div class="stock-item"><div><b>${s.name} (${s.code})</b> · ${s.industry}<br/><span class="muted">ROE ${s.roe}% / 增速 ${s.revGrowth}% / 股息 ${s.dividend}%</span></div><div><span class="badge">${s.tag}</span> <b>${s.score}</b></div></div>`).join('') || '<p class="muted">没有符合条件的股票，放宽筛选试试。</p>';

  qs('#summary').innerHTML = `<span>样本数 ${stocks.length}</span><span>入选 ${filtered.length}</span><span>TOP1 ${top[0]?.name || '-'} </span>`;
}

function setupIndustries(){
  const set = ['全部', ...new Set(stocks.map(s=>s.industry))];
  industryFilter.innerHTML = set.map(i=>`<option>${i}</option>`).join('');
}

function setupLearn(){
  qs('#learn-cards').innerHTML = education.map(([t,d])=>`<article><h3>${t}</h3><p class="muted">${d}</p></article>`).join('');
}

function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const [header,...rows] = lines;
  const cols = header.split(',').map(s=>s.trim());
  return rows.map(r=>{
    const m = {}; r.split(',').forEach((v,i)=>m[cols[i]] = v.trim());
    return {
      code:m.code, name:m.name, industry:m.industry,
      pe:+m.pe, pb:+m.pb, roe:+m.roe, revGrowth:+m.revGrowth, debt:+m.debt, dividend:+m.dividend,
    };
  }).filter(s=>s.code && s.name && !Number.isNaN(s.pe));
}

qs('#load-demo').onclick = ()=>{ stocks = [...demoStocks]; setupIndustries(); run(); };
qs('#run-analysis').onclick = run;
qs('#apply').onclick = run;
riskProfile.onchange = ()=>{ renderWeights(); run(); };
scoreMin.oninput = ()=>{ scoreMinV.textContent = scoreMin.value; run(); };
qs('#csv-input').addEventListener('change', async (e)=>{
  const file = e.target.files?.[0]; if(!file) return;
  const text = await file.text();
  const parsed = parseCSV(text);
  if (!parsed.length) return alert('CSV解析失败。表头需包含: code,name,industry,pe,pb,roe,revGrowth,debt,dividend');
  stocks = parsed;
  setupIndustries(); run();
});

renderWeights();
setupIndustries();
setupLearn();
run();
