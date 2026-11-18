/* Research display: original scores are preserved; derived comparisons are explicit scenarios. */
(() => {
  'use strict';
  const data = window.PSR_DATA, derived = window.PSR_DERIVED, evidence = window.PSR_EVIDENCE;
  if (!data || !derived || !window.echarts) {
    document.querySelector('.hero-sub').textContent = '研究数据尚未加载，请使用完整交付包或单文件版。';
    return;
  }
  const original = data.countries.countries;
  const names = {CHN:'中国',VNM:'越南',THA:'泰国',MYS:'马来西亚',IDN:'印度尼西亚',KHM:'柬埔寨',PHL:'菲律宾',SGP:'新加坡',USA:'美国',DEU:'德国',NLD:'荷兰',GBR:'英国',CAN:'加拿大',AUS:'澳大利亚',MEX:'墨西哥',IND:'印度',BRA:'巴西'};
  const hubs = data.meta.countries.sea, targets = data.meta.countries.target;
  const indicators = data.meta.indicators, lookup = Object.fromEntries(indicators.map(i => [i.key,i]));
  const palette = {ink:'#17382e', green:'#547c65', rust:'#b1543d',muted:'#777c74',line:'#e2e3da',paper:'#f4f3ee',neutral:'#c4c9bf'};
  const state = {target:'USA',hub:'VNM',mode:'original',weight:'equal',alpha:.45};
  const charts = {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (n, digits=2) => Number.isFinite(n) ? n.toFixed(digits) : '—';
  const signed = n => Number.isFinite(n) ? `${Math.abs(n)<.005?'':n>0?'+':'−'}${num(Math.abs(n))}` : '—';
  const label = iso => names[iso] || derived.countries[iso]?.name || iso;
  const commonKeys = target => derived.comparisons[target].freshIndicators;
  const score = (iso,target=state.target,mode=state.mode) => mode === 'common' ? derived.comparisons[target].scores[iso].freshScore : original[iso].psr_by_weight[state.weight];
  function path(hub,target=state.target,mode=state.mode,alpha=state.alpha) {
    const host = score(hub,target,mode), direct = score(target,target,mode);
    return {host,direct,via:(1-alpha)*direct+alpha*host,delta:alpha*(host-direct)};
  }
  function loo(hub,target=state.target) {
    const keys = commonKeys(target), a=original[hub].indicators, b=original[target].indicators;
    const values=keys.map(omit=>{
      const keep=keys.filter(k=>k!==omit);
      return {key:omit,delta:.45*keep.reduce((sum,k)=>sum+a[k]-b[k],0)/keep.length};
    });
    return {values,min:Math.min(...values.map(v=>v.delta)),max:Math.max(...values.map(v=>v.delta))};
  }
  function toast(message) {
    $('toast').textContent=message; $('toast').hidden=false;
    window.clearTimeout(toast.timer); toast.timer=window.setTimeout(()=>$('toast').hidden=true,3500);
  }
  function chart(id) {
    if (!charts[id]) charts[id]=echarts.init($(id),null,{renderer:'canvas'});
    return charts[id];
  }
  const baseOptions = () => ({animationDuration:400,textStyle:{fontFamily:'-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif',color:palette.muted,fontSize:12},tooltip:{backgroundColor:'#fffefa',borderColor:palette.line,padding:14,textStyle:{color:palette.ink,fontSize:12},extraCssText:'box-shadow:0 8px 30px rgba(23,56,46,.08);border-radius:4px;'}});
  function updateControls() {
    $('weight-field').hidden=state.mode!=='original';
    document.querySelectorAll('[data-mode]').forEach(el=>{const active=el.dataset.mode===state.mode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('.hub-chip').forEach(el=>{const active=el.dataset.hub===state.hub;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    $('target-select').value=state.target;
    $('alpha-output').textContent=`${Math.round(state.alpha*100)}%`;
  }
  function renderRoute() {
    const c=derived.comparisons[state.target], p=path(state.hub);
    const rows=hubs.map(iso=>({iso,...path(iso)})).sort((a,b)=>a.via-b.via);
    $('selected-route-title').textContent=`中国 → ${label(state.hub)} → ${label(state.target)}`;
    $('route-delta').innerHTML=`${signed(p.delta)}<span>分</span>`;
    $('route-delta').style.color=Math.abs(p.delta)<.005?'#faf9f5':p.delta<0?'#d0dfb4':'#e6b4a5';
    const o=original[state.hub], years=Object.values(o.years).filter(Number.isFinite), n=commonKeys(state.target).length;
    $('route-facts').innerHTML=[['目标市场分数',num(p.direct)],['中转地分数',num(p.host)],['经中转模型分',num(p.via)],['口径',state.mode==='common'?`${n} 项 · 等权对照`:`PSR · ${state.weight==='equal'?'等权':state.weight}`],['中转地数据覆盖',`${o.n_indicators}/14 · 最早 ${Math.min(...years)} 年`]].map(([a,b])=>`<div class="fact-row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');
    const commonP=path(state.hub,state.target,'common',.45), oldP=derived.comparisons[state.target].paths[state.hub].original, range=loo(state.hub), cross=range.min<0&&range.max>0;
    const flip=commonP.delta*oldP.delta<0;
    let message=state.alpha===0?'α 为 0，两种情景同分。':Math.abs(p.delta)<.005?'模型分差接近零。':`模型分数${p.delta<0?'低':'高'} ${num(Math.abs(p.delta))} 分。`;
    if(state.alpha>0&&flip) message+=' PSR 等权与共同项对照的方向相反。';
    $('route-interpretation').textContent=message;
    $('comparison-sub').textContent=`${state.mode==='common'?'共同8项对照':`PSR · ${state.weight==='equal'?'等权':state.weight==='entropy'?'熵值法':'CRITIC'}`}｜直接进入${label(state.target)} = 0｜α = ${Math.round(state.alpha*100)}%。`;
    $('model-explanation').innerHTML=`Δ = α ×（中转地分数 − 目标市场分数）。<strong>α 为假设；这是模型分差，非实际税负。</strong>`;
    const bound=Math.ceil(Math.max(12,...rows.map(r=>Math.abs(r.delta)+2))/5)*5;
    const option={...baseOptions(),grid:{left:20,right:48,top:28,bottom:25,containLabel:true},tooltip:{...baseOptions().tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:items=>{const row=rows[items[0].dataIndex];return `<strong>${esc(label(row.iso))} → ${esc(label(state.target))}</strong><br>目标市场基准：${num(row.direct)}<br>经中转结构代理：${num(row.via)}<br>差值：${signed(row.delta)} 分<br><span style="color:#777">α 为假设；非实际路径总风险</span>`;}},xAxis:{type:'value',min:-bound,max:bound,axisLabel:{color:palette.muted},axisLine:{show:false},splitLine:{lineStyle:{color:palette.line,type:'dashed'}}},yAxis:{type:'category',inverse:true,data:rows.map(r=>label(r.iso)),axisLine:{show:false},axisTick:{show:false},axisLabel:{color:palette.ink,fontSize:13,fontWeight:500}},series:[{name:'结构代理差距',type:'bar',barWidth:20,data:rows.map(r=>({value:r.delta,itemStyle:{color:Math.abs(r.delta)<.005?palette.muted:r.delta<0?palette.green:palette.rust,opacity:r.iso===state.hub?1:.65},label:{position:r.delta<0?'left':'right'}})),label:{show:true,color:palette.ink,fontSize:12,formatter:x=>signed(x.value)},markLine:{silent:true,symbol:'none',data:[{xAxis:0}],lineStyle:{color:palette.ink,type:'dashed',width:1},label:{show:true,formatter:'直接进入 = 0',position:'end',rotate:0,fontSize:10,color:palette.ink}}}]};
    chart('route-chart').setOption(option,true);
    charts['route-chart'].off('click');charts['route-chart'].on('click',params=>{if(params.componentType==='series') {state.hub=rows[params.dataIndex].iso;render();}});
  }
  function renderHeatmap() {
    const records=[];
    hubs.forEach((hub,y)=>targets.forEach((target,x)=>records.push([x,y,path(hub,target).delta])));
    const bound=Math.max(12,...records.map(v=>Math.abs(v[2])));
    $('heatmap-chart').previousElementSibling.textContent=state.mode==='common'?'共同8项对照，用于检查指标选择的影响。':'PSR 路径模型分差；负值较低，正值较高。';
    chart('heatmap-chart').setOption({...baseOptions(),grid:{left:90,right:12,top:18,bottom:92},tooltip:{...baseOptions().tooltip,formatter:p=>{const [x,y,d]=p.value;return `<strong>${esc(label(hubs[y]))} → ${esc(label(targets[x]))}</strong><br>结构代理差值：${signed(d)} 分<br>α = ${Math.round(state.alpha*100)}%；${state.mode==='common'?'共同项对照':'PSR'}<br>点击查看路径`;}},xAxis:{type:'category',data:targets.map(label),position:'bottom',axisLine:{show:false},axisTick:{show:false},axisLabel:{color:palette.ink,interval:0,fontSize:11}},yAxis:{type:'category',data:hubs.map(label),inverse:true,axisLine:{show:false},axisTick:{show:false},axisLabel:{color:palette.ink,fontSize:12}},visualMap:{min:-bound,max:bound,calculable:false,orient:'horizontal',left:'center',bottom:0,itemWidth:9,itemHeight:180,text:['结构分较高','结构分较低'],textStyle:{color:palette.muted,fontSize:10},inRange:{color:['#315e4f','#e7ebe0','#f4f3ee','#efd7c7','#ac4d37']}},series:[{type:'heatmap',data:records,label:{show:true,color:palette.ink,fontSize:11,formatter:p=>signed(p.value[2])},itemStyle:{borderColor:palette.paper,borderWidth:4},emphasis:{itemStyle:{borderColor:palette.ink,borderWidth:2}}}]},true);
    charts['heatmap-chart'].off('click');charts['heatmap-chart'].on('click',p=>{if(p.componentType==='series'){state.target=targets[p.value[0]];state.hub=hubs[p.value[1]];render();$('routes').scrollIntoView({behavior:'smooth',block:'start'});}});
  }
  function renderIndicators() {
    const a=original[state.hub], b=original[state.target];
    const keys=state.mode==='common'?commonKeys(state.target):indicators.filter(i=>a.indicators[i.key]!=null&&b.indicators[i.key]!=null).map(i=>i.key);
    const contribution=state.mode==='common';
    const rows=keys.map(key=>({key,value:(a.indicators[key]-b.indicators[key])*(contribution?state.alpha/keys.length:1)})).sort((x,y)=>x.value-y.value);
    $('indicator-sub').textContent=contribution?`共同8项的分差贡献，合计 ${signed(path(state.hub).delta)} 分。`:`展示两国均有数据的 ${keys.length} 项；分项差值不直接加总为 PSR 分差。`;
    chart('indicator-chart').setOption({...baseOptions(),grid:{left:16,right:58,top:12,bottom:25,containLabel:true},tooltip:{...baseOptions().tooltip,trigger:'axis',formatter:p=>{const r=rows[p[0].dataIndex],i=lookup[r.key];return `<strong>${esc(i.name_zh)}</strong><br>${esc(label(state.hub))}：${num(a.indicators[r.key])} (${a.years[r.key]}年)<br>${esc(label(state.target))}：${num(b.indicators[r.key])} (${b.years[r.key]}年)<br>${contribution?'情景分差贡献':'指标差值'}：${signed(r.value)} 分`; }},xAxis:{type:'value',axisLine:{show:false},axisLabel:{color:palette.muted},splitLine:{lineStyle:{color:palette.line,type:'dashed'}}},yAxis:{type:'category',data:rows.map(r=>`${r.key}  ${lookup[r.key].name_zh}`),inverse:true,axisLine:{show:false},axisTick:{show:false},axisLabel:{color:palette.ink,fontSize:11}},series:[{type:'bar',barWidth:16,data:rows.map(r=>({value:r.value,itemStyle:{color:r.value<0?palette.green:palette.rust}})),label:{show:true,position:'right',fontSize:11,color:palette.ink,formatter:p=>signed(p.value)}}]},true);
    document.querySelectorAll('.indicator-row').forEach(el=>{
      const included=state.mode==='original'||commonKeys(state.target).includes(el.dataset.key);
      el.classList.toggle('included',included);
      const mark=el.querySelector('.indicator-state');mark.textContent=included?'●':'○';mark.title=state.mode==='original'?'PSR 构成指标':included?'共同项对照保留':'共同项对照移出';
    });
  }
  function renderRobustness() {
    const rows=hubs.map(iso=>{const range=loo(iso),point=path(iso,state.target,'common',.45).delta;return {iso,...range,point,psr:derived.comparisons[state.target].paths[iso].original.delta,cross:range.min<0&&range.max>0};}).sort((a,b)=>a.point-b.point);
    const bound=Math.ceil((Math.max(8,...rows.flatMap(r=>[Math.abs(r.min),Math.abs(r.max),Math.abs(r.psr)]))+2)/5)*5;
    chart('robustness-chart').setOption({...baseOptions(),grid:{left:18,right:25,top:18,bottom:32,containLabel:true},tooltip:{...baseOptions().tooltip,formatter:p=>{const r=rows[p.dataIndex];return `<strong>${esc(label(r.iso))} → ${esc(label(state.target))}</strong><br>PSR 等权：${signed(r.psr)} 分<br>共同项对照：${signed(r.point)} 分<br>逐项剔除范围：${signed(r.min)} 至 ${signed(r.max)}<br>${r.cross?'跨零，方向敏感':'方向稳定'}<br>固定 α = 45%；非置信区间`; }},xAxis:{type:'value',min:-bound,max:bound,axisLine:{show:false},axisLabel:{color:palette.muted},splitLine:{lineStyle:{color:palette.line,type:'dashed'}}},yAxis:{type:'category',data:rows.map(r=>`${label(r.iso)}${r.cross?' · 敏感':''}`),inverse:true,axisLine:{show:false},axisTick:{show:false},axisLabel:{color:palette.ink,fontSize:12}},series:[{type:'custom',data:rows.map((r,i)=>[r.min,i,r.max,r.point]),renderItem:(params,api)=>{const row=rows[params.dataIndex],left=api.coord([api.value(0),api.value(1)]),right=api.coord([api.value(2),api.value(1)]),point=api.coord([api.value(3),api.value(1)]),color=row.cross?palette.rust:palette.green;return {type:'group',children:[{type:'line',shape:{x1:left[0],y1:left[1],x2:right[0],y2:right[1]},style:{stroke:color,lineWidth:3,opacity:.6}},{type:'line',shape:{x1:left[0],y1:left[1]-5,x2:left[0],y2:left[1]+5},style:{stroke:color,lineWidth:1}},{type:'line',shape:{x1:right[0],y1:right[1]-5,x2:right[0],y2:right[1]+5},style:{stroke:color,lineWidth:1}},{type:'circle',shape:{cx:point[0],cy:point[1],r:5},style:{fill:color,stroke:palette.paper,lineWidth:2}}]};}},{name:'PSR 等权',type:'scatter',data:rows.map((r,i)=>[r.psr,i]),symbol:'diamond',symbolSize:9,itemStyle:{color:palette.paper,borderColor:palette.ink,borderWidth:1.4},markLine:{silent:true,symbol:'none',data:[{xAxis:0}],lineStyle:{color:palette.ink,type:'dashed',width:1},label:{show:true,formatter:'零差距',position:'end',rotate:0,fontSize:10,color:palette.ink}}}]},true);
    $('common-count').textContent=`${commonKeys(state.target).length} / 14`;
    $('coverage-grid').innerHTML=[state.hub,state.target].map(iso=>{const o=original[iso],c=derived.countries[iso],old=c?.stale || [],years=Object.values(o.years).filter(Number.isFinite),missing=indicators.filter(i=>o.indicators[i.key]==null);return `<article class="coverage-card"><div class="panel-heading"><h3>${esc(label(iso))} · 数据覆盖</h3><span>${o.n_indicators}/14</span></div><div class="coverage-track" aria-label="原包指标覆盖率"><i style="width:${o.n_indicators/14*100}%"></i></div><p>最早 ${Math.min(...years)} 年。缺失：${missing.length?missing.map(i=>esc(i.key)).join('、'):'无'}。</p>${old.length?'<p>旧值：'+old.map(v=>`${esc(v.key)} (${v.year})`).join('、')+'。</p>':''}</article>`;}).join('');
  }
  function renderSources() {
    const common=new Set(commonKeys('USA'));
    $('indicator-grid').innerHTML=data.meta.dims.map(dim=>`<article class="indicator-dimension"><div class="dimension-label">DIMENSION ${esc(dim.key)}</div><h3 class="dimension-title">${esc(dim.name_zh)}</h3><p class="dimension-copy">${dim.key==='A'?'进入与保护条件，描述制度约束。':dim.key==='B'?'产业与贸易限制，描述政策干预。':'制度、外交与退出，描述调整环境。'}</p><div class="indicator-list">${indicators.filter(i=>i.dim===dim.key).map(i=>`<div class="indicator-row ${common.has(i.key)?'included':''}" data-key="${esc(i.key)}"><span class="indicator-key">${esc(i.key)}</span><div><span class="indicator-name">${esc(i.name_zh)}</span><span class="indicator-source">${esc(i.dataset)}</span></div><span class="indicator-state" title="${common.has(i.key)?'进入统一8项比较':'原指标保留，未进入统一比较'}">${common.has(i.key)?'●':'○'}</span></div>`).join('')}</div></article>`).join('');
    const roles=Object.fromEntries(data.meta.datasets.map(ds=>{const use=indicators.filter(i=>i.dataset===ds.slug).map(i=>i.key);return [ds.slug,use];}));
    $('source-body').innerHTML=data.meta.datasets.map(ds=>{const use=roles[ds.slug],sample=ds.slug==='atlas-economic-complexity';return `<tr><td><strong>${esc(ds.title_zh||ds.title)}</strong><small>${esc(ds.slug)}</small></td><td><span class="source-role ${use.length?'used':''}">${use.length?'原指标入模':sample?'样本界定':'背景 / 排除'}</span></td><td>${use.length?esc(use.join(' / ')):sample?'按贸易规模筛选51个经济体':ds.slug==='global-trade-alert'?'原包覆盖不完整，排除':'未参与分数计算'}</td><td class="numeric">${Number(ds.rows).toLocaleString('zh-CN')}</td><td><a href="${esc(ds.url)}" target="_blank" rel="noopener noreferrer">数据平台 ↗</a></td></tr>`;}).join('');
  }
  function renderEvidence() {
    if (!evidence?.events?.length) {$('policy-timeline').innerHTML='<p class="empty-state">政策证据尚未加载。</p>';return;}
    const briefs=[
      '四国部分光伏加工被纳入反规避范围，具体工序与认证条件决定适用。',
      '东南亚原产光伏也可能面临新的反倾销、反补贴措施。',
      '四国光伏贸易救济命令发布；2026 年启动复审，税率须按企业核验。',
      '针对逃避关税转运的历史条款；相关 IEEPA 额外税已于 2026 年停止征收。',
      '相关 IEEPA 额外税停止征收，其他法律依据下的税费另查。'
    ];
    $('policy-timeline').innerHTML=evidence.events.map((event,i)=>`<article class="timeline-event"><div class="event-date">${esc(event.date.replaceAll('-','.'))}</div><div class="event-content"><span class="event-type">${esc(event.type)}</span><h4 class="event-title">${esc(event.title)}</h4><p class="event-copy">${esc(briefs[i]||event.summary)}</p><a class="event-link" href="${esc(event.url)}" target="_blank" rel="noopener noreferrer">官方原文 ↗</a><details class="source-details"><summary>适用范围与后续文件 <span>＋</span></summary><p class="event-status">${esc(event.status)}</p>${(event.references||[]).map(ref=>`<a class="event-link" href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.label)} ↗</a>`).join('')}</details></div></article>`).join('');
  }
  function renderWorld() {
    if (charts['world-chart']) {charts['world-chart'].resize();return;}
    echarts.registerMap('psr-world',data.geo);
    const pool=Object.values(original).filter(c=>c.in_pool);
    chart('world-chart').setOption({...baseOptions(),tooltip:{...baseOptions().tooltip,formatter:p=>{const c=original[p.name];return !c||!c.in_pool?'不在51个研究样本中':`${esc(label(p.name))}<br>原始PSR：${num(c.psr)}<br>指标覆盖：${c.n_indicators}/14<br>仅用于国别背景，不表示具体路线风险`; }},visualMap:{min:0,max:100,left:0,bottom:0,orient:'horizontal',itemHeight:150,itemWidth:8,inRange:{color:['#dce8d4','#829e7b','#315e4f']},text:['高结构约束','低结构约束'],textStyle:{fontSize:10,color:palette.muted}},series:[{type:'map',map:'psr-world',roam:true,scaleLimit:{min:1,max:5},data:pool.map(c=>({name:c.iso3,value:c.psr})),itemStyle:{areaColor:'#e8e9e2',borderColor:palette.paper,borderWidth:.5},emphasis:{label:{show:false},itemStyle:{areaColor:'#b7cba5'}},select:{disabled:true},label:{show:false},layoutCenter:['50%','45%'],layoutSize:'125%'}]},true);
  }
  function renderEconomics() {
    const ids=['price','cost','customs','relocation','profit'];
    const values=Object.fromEntries(ids.map(id=>[id,Number($(id).value)]));
    const invalid=ids.some(id=>$(id).value.trim()===''||!Number.isFinite(values[id])||values[id]<0);
    if(invalid||values.customs<=0){$('tariff-threshold').textContent='—';$('economics-copy').textContent='请输入非负数，且完税价格须大于零。';return;}
    const available=values.price-values.cost-values.relocation-values.profit, threshold=available/values.customs*100;
    $('tariff-threshold').textContent=threshold<0?'未达标':`${num(threshold,1)}%`;
    $('economics-copy').textContent=threshold<0?`无新增税负时，利润仍差 ${num(-available)}。`:`单位利润缓冲 ${num(available)}；税率超过上限，利润不达标。`;
  }
  let previousFocus;
  function showMethod() {
    const keys=commonKeys(state.target), all=data.meta.indicators;
    const shown=state.mode==='common'?keys:all.map(i=>i.key);
    $('modal-body').innerHTML=`<h3>主指标：PSR</h3><p>原有 14 项指标，归入准入、贸易、政社三个维度。各国按可用项汇总；缺失不补零。</p><div class="formula-block">PSR(c) = Σ 可用项〔wᵢ × Sᵢ(c)〕 / Σ 可用项 wᵢ<br>经中转模型分 = (1 − α) × 目标市场分 + α × 中转地分<br>Δ = α ×（中转地分 − 目标市场分）</div><h3>稳健性检验：共同项对照</h3><p>取 16 个经济体都有、年份在 2020–2023 的 8 项，沿用标准化分数等权平均：${keys.join('、')}。</p><p>它检查指标选择是否改变结论。删去 6 项后，覆盖范围缩小，<strong>不能替代完整 PSR，也不代表现实风险发生变化</strong>。</p><details class="source-details"><summary>所选两国的指标值与年份 <span>＋</span></summary><table class="modal-table"><thead><tr><th>指标</th><th>${esc(label(state.hub))}</th><th>${esc(label(state.target))}</th></tr></thead><tbody>${shown.map(k=>`<tr><td>${k} · ${esc(lookup[k].name_zh)}</td><td>${num(original[state.hub].indicators[k])}<small>${original[state.hub].years[k]??'—'} 年</small></td><td>${num(original[state.target].indicators[k])}<small>${original[state.target].years[k]??'—'} 年</small></td></tr>`).join('')}</tbody></table></details><p>α 为模型假设；分差不是实际税负或损失。</p>`;
    previousFocus=document.activeElement;$('method-modal').hidden=false;document.body.style.overflow='hidden';$('close-modal').focus();
  }
  function closeMethod() {$('method-modal').hidden=true;document.body.style.overflow='';previousFocus?.focus();}
  function download(name,content,type) {
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadCSV() {
    const rows=[['hub_iso3','hub_name','target_iso3','target_name','metric','weight','alpha_assumed','indicator_count','host_score','target_score','scenario_score','scenario_delta_points','original_coverage','measurement_reference_year','meaning']];
    hubs.forEach(hub=>targets.forEach(target=>{const p=path(hub,target);rows.push([hub,label(hub),target,label(target),state.mode==='common'?'global_common_8':'original_psr',state.mode==='common'?'equal':state.weight,state.alpha,state.mode==='common'?commonKeys(target).length:'country_specific',num(p.host,6),num(p.direct,6),num(p.via,6),num(p.delta,6),original[hub].coverage,2023,'structural_proxy_scenario_not_actual_route_loss_or_tariff']);}));
    const csv=rows.map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\r\n');download(`route-comparison-${state.mode}-alpha-${Math.round(state.alpha*100)}.csv`,'\uFEFF'+csv,'text/csv;charset=utf-8');toast('已导出63条路径，含口径与假设。');
  }
  function render() {updateControls();renderRoute();renderHeatmap();renderIndicators();renderRobustness();}
  $('target-select').innerHTML=targets.map(iso=>`<option value="${iso}">${esc(label(iso))}</option>`).join('');
  $('hub-picker').innerHTML=hubs.map(iso=>`<button class="hub-chip ${iso===state.hub?'active':''}" data-hub="${iso}" aria-pressed="${iso===state.hub}">${esc(label(iso))}<span>${iso}</span></button>`).join('');
  $('target-select').addEventListener('change',e=>{state.target=e.target.value;render();});
  $('weight-select').addEventListener('change',e=>{state.weight=e.target.value;render();});
  $('metric-tabs').addEventListener('click',e=>{const button=e.target.closest('[data-mode]');if(button){state.mode=button.dataset.mode;render();}});
  $('hub-picker').addEventListener('click',e=>{const button=e.target.closest('[data-hub]');if(button){state.hub=button.dataset.hub;render();}});
  $('alpha').addEventListener('input',e=>{state.alpha=Number(e.target.value)/100;render();});
  $('method-button').addEventListener('click',showMethod);$('formula-button').addEventListener('click',showMethod);$('close-modal').addEventListener('click',closeMethod);
  document.querySelector('[data-close]').addEventListener('click',closeMethod);
  document.addEventListener('keydown',e=>{if($('method-modal').hidden)return;if(e.key==='Escape')closeMethod();if(e.key==='Tab'){const nodes=[...$('method-modal').querySelectorAll('button,a,input,select,[tabindex]')].filter(el=>!el.hidden),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  document.querySelectorAll('.economics-inputs input').forEach(input=>input.addEventListener('input',renderEconomics));
  $('download-data').addEventListener('click',downloadCSV);
  $('download-json').addEventListener('click',()=>{download('psr-research-data.json',JSON.stringify({original:data,derived,policyEvidence:evidence,viewScenario:{...state},notes:['Original acquisition not independently reproduced.','Scenario weights are assumptions, scores are not probabilities.']},null,2),'application/json');toast('已导出原始包、派生数据与政策出处。');});
  $('export-chart').addEventListener('click',()=>{
    const source=charts['route-chart'].getDataURL({pixelRatio:3,backgroundColor:palette.paper}),image=new Image();
    const caption={target:label(state.target),alpha:Math.round(state.alpha*100),mode:state.mode,weight:state.weight};
    image.onload=()=>{
      const canvas=document.createElement('canvas'),scale=3,width=image.width/scale;
      canvas.width=image.width;canvas.height=image.height+132*scale;
      const ctx=canvas.getContext('2d');ctx.fillStyle=palette.paper;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);
      ctx.fillStyle=palette.ink;ctx.font='bold 18px sans-serif';ctx.fillText('直接进入 vs 经东南亚：结构代理差值',18,30);
      ctx.font='11px sans-serif';ctx.fillStyle=palette.muted;ctx.fillText(`目标 ${caption.target} · α = ${caption.alpha}%（假设）· ${caption.mode==='common'?'共同项对照':`PSR / ${caption.weight}`} · 2023基准`,18,52);
      ctx.drawImage(image,0,66,width,image.height/scale);
      ctx.fillText('分数点，非税率或概率；未计原产地、实际税负及新增投资成本。',18,image.height/scale+90);
      ctx.fillText('来源：团队PSR输入包；路径模型与稳健性对照。',18,image.height/scale+109);
      const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`${state.target}-route-comparison-${state.mode}.png`;a.click();toast('已生成图表，含口径、日期与模型边界。');
    };
    image.onerror=()=>toast('图表生成失败，请使用浏览器打印保存研究页。');image.src=source;
  });
  $('print-page').addEventListener('click',()=>{document.querySelectorAll('details').forEach(d=>d.open=true);renderWorld();Object.values(charts).forEach(c=>c.resize());window.setTimeout(()=>window.print(),200);});
  document.querySelectorAll('details').forEach(details=>details.addEventListener('toggle',()=>{if(details.open&&details.querySelector('#world-chart'))renderWorld();}));
  const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){document.querySelectorAll('.nav-item').forEach(link=>link.classList.toggle('active',link.hash==='#'+entry.target.id));}});},{rootMargin:'-10% 0px -75% 0px',threshold:0});
  document.querySelectorAll('main > section[id]').forEach(section=>observer.observe(section));
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>Object.values(charts).forEach(c=>c.resize()),100);});
  window.addEventListener('beforeprint',()=>Object.values(charts).forEach(c=>c.resize()));
  $('flip-count').textContent=derived.summary.nIndicatorDatasets;
  $('finding-flip').textContent='原 PSR 下，新加坡相对美国较低；泰国、印尼较高。';
  renderSources();renderEvidence();renderEconomics();render();
  window.PSR_APP={state,path,score,loo,render,charts,commonKeys};
})();
