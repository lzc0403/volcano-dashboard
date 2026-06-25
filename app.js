/**
 * app.js - Dashboard renderer
 * 由 index.html 加载，读取 data.json 数据并渲染所有图表
 */

// ===================== UTILITIES =====================
var sum = function(arr) { return arr.reduce(function(a, b) { return a + (b || 0); }, 0); };
var mean = function(arr) { var v = arr.filter(function(x) { return x != null; }); return v.length ? sum(v) / v.length : 0; };
var median = function(arr) { var v = arr.filter(function(x) { return x !== null; }).sort(function(a,b) { return a-b; }); var m = Math.floor(v.length/2); return v.length % 2 ? v[m] : (v[m-1]+v[m])/2; };
var std = function(arr) { var v = arr.filter(function(x) { return x !== null; }); var m = mean(v); return Math.sqrt(v.reduce(function(s, x) { return s + Math.pow(x-m,2); }, 0) / v.length); };
var arrMax = function(arr) { return Math.max.apply(null, arr.filter(function(x) { return x !== null; })); };
var arrMin = function(arr) { return Math.min.apply(null, arr.filter(function(x) { return x !== null && x > 0; })); };
var cv = function(arr) { var m = mean(arr); return m > 0 ? (std(arr)/m*100) : 0; };
var fmt = function(n) { return n >= 10000 ? (n/10000).toFixed(2) + '万' : n >= 1000 ? n.toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') : n.toFixed(2); };
var fmtShort = function(n) { return n >= 10000 ? (n/10000).toFixed(1) + '万' : n >= 1000 ? (n/1000).toFixed(1) + 'K' : n.toFixed(0); };

// boc-scraper palette
var PRIMARY = '#533afd';
var PRIMARY_DEEP = '#4434d4';
var PRIMARY_SOFT = '#665efd';
var PRIMARY_SUBDUED = '#b9b9f9';
var GREEN = '#0ca678';
var RED = '#e03131';
var INK = '#0d253d';
var INK_MUTE = '#64748d';
var HAIRLINE = '#e3e8ee';
var CANVAS_SOFT = '#f6f9fc';

var CHART_COLORS = [PRIMARY, '#273951', GREEN, '#e6a817', RED, PRIMARY_SOFT, '#94a3b8', '#0ca678', '#c2850a', '#64748d', PRIMARY_SUBDUED];
var CHART_COLORS_ALPHA = CHART_COLORS.map(function(c) {
  var r = parseInt(c.slice(1,3), 16), g = parseInt(c.slice(3,5), 16), b = parseInt(c.slice(5,7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',0.55)';
});

// Chart.js defaults
Chart.defaults.color = INK_MUTE;
Chart.defaults.borderColor = HAIRLINE;
Chart.defaults.font.family = "'Inter', 'Noto Sans SC', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.font.weight = 400;
Chart.defaults.plugins.tooltip.backgroundColor = INK;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,0,0,0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 6;
Chart.defaults.plugins.tooltip.padding = 8;
Chart.defaults.plugins.tooltip.titleFont = { size: 11, weight: 600 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };

// Store chart instances for cleanup
var chartInstances = {};
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

// ===================== MAIN RENDER =====================
function renderDashboard(data) {
  // Find main account (first one, usually 深圳帐号)
  var accountNames = Object.keys(data.accounts);
  var mainAccountName = accountNames[0];
  var mainAccount = data.accounts[mainAccountName];

  if (!mainAccount || !mainAccount.dates || !mainAccount.projects) {
    document.getElementById('alerts-container').innerHTML = '<div class="alert-card err">数据格式异常</div>';
    return;
  }

  var dates = mainAccount.dates;
  var projects = mainAccount.projects;
  var totalKey = Object.keys(projects).find(function(k) { return k === '合计'; }) || '合计';
  var szTotal = projects[totalKey] || [];

  // Update header
  document.getElementById('lastUpdate').textContent = '更新于 ' + new Date(data.timestamp).toLocaleString('zh-CN');
  document.getElementById('dataRange').textContent = dates[0] + ' - ' + dates[dates.length - 1];
  document.getElementById('genTime').textContent = new Date(data.timestamp).toLocaleDateString('zh-CN');
  document.getElementById('trendTitle').textContent = mainAccountName + ' 每日总消耗';

  // KPI
  var totalConsumption = sum(szTotal);
  var dailyAvg = mean(szTotal);
  var peakVal = arrMax(szTotal);
  var peakIdx = szTotal.indexOf(peakVal);
  var totalProjects = 0;
  accountNames.forEach(function(a) { totalProjects += Object.keys(data.accounts[a].projects).filter(function(k) { return k !== '合计'; }).length; });

  document.getElementById('kpi-total').textContent = fmt(totalConsumption);
  document.getElementById('kpi-daily-avg').textContent = fmt(dailyAvg);
  document.getElementById('kpi-peak').textContent = fmt(peakVal);
  document.getElementById('kpi-peak-date').textContent = '峰值 ' + dates[peakIdx];
  document.getElementById('kpi-projects').textContent = totalProjects;

  var firstWeek = szTotal.slice(0, 7), lastWeek = szTotal.slice(-7);
  var trendPct = ((mean(lastWeek) - mean(firstWeek)) / mean(firstWeek) * 100).toFixed(1);
  var trendEl = document.getElementById('kpi-total-trend');
  var dailyTrendEl = document.getElementById('kpi-daily-trend');
  if (trendPct > 0) {
    trendEl.className = 'kpi-chip up'; trendEl.textContent = '+' + trendPct + '% vs 月初';
    dailyTrendEl.className = 'kpi-chip up'; dailyTrendEl.textContent = '活跃增长期';
  } else {
    trendEl.className = 'kpi-chip down'; trendEl.textContent = trendPct + '% vs 月初';
    dailyTrendEl.className = 'kpi-chip down'; dailyTrendEl.textContent = '近期回落';
  }

  // Alerts
  var alerts = [];
  var projectNames = Object.keys(projects).filter(function(k) { return k !== '合计'; });
  projectNames.forEach(function(name) {
    var vals = projects[name].filter(function(x) { return x !== null; });
    if (vals.length < 3) return;
    var m = mean(vals), s = std(vals);
    var anomalies = vals.filter(function(x) { return Math.abs(x - m) > 2 * s; });
    anomalies.forEach(function(v) {
      var idx = projects[name].indexOf(v);
      alerts.push({ type: 'err', text: '<strong>' + name + ' 异常值</strong> ' + dates[idx] + ' 消耗 ' + fmt(v) + '，为均值 ' + (v/m).toFixed(1) + ' 倍' });
    });
    if (vals.length >= 7) {
      var ratio = mean(vals.slice(-7)) / mean(vals.slice(0, 7));
      if (ratio < 0.5) alerts.push({ type: 'warn', text: '<strong>' + name + ' 骤降</strong> 近7天均值仅为前7天的 ' + (ratio*100).toFixed(0) + '%' });
    }
  });
  if (alerts.length === 0) alerts.push({ type: 'info', text: '<strong>数据正常</strong> 未检测到显著异常' });
  document.getElementById('alerts-container').innerHTML = alerts.slice(0, 5).map(function(a) {
    return '<div class="alert-card ' + a.type + '">' + a.text + '</div>';
  }).join('');

  // Main trend chart
  destroyChart('mainTrend');
  chartInstances['mainTrend'] = new Chart(document.getElementById('chartMainTrend'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: '每日总消耗', data: szTotal, borderColor: PRIMARY, backgroundColor: function(ctx) { var g = ctx.chart.ctx.createLinearGradient(0,0,0,320); g.addColorStop(0,'rgba(83,58,253,0.10)'); g.addColorStop(1,'rgba(83,58,253,0)'); return g; }, fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5, pointBackgroundColor: PRIMARY, pointBorderColor: '#fff', pointBorderWidth: 2, borderWidth: 2 },
        { label: '7日移动平均', data: szTotal.map(function(_, i) { return i >= 6 ? mean(szTotal.slice(i-6, i+1)) : null; }), borderColor: '#94a3b8', borderDash: [4,3], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'line', padding: 14 } }, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmt(ctx.raw); } } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { ticks: { callback: function(v) { return fmtShort(v); } }, grid: { color: CANVAS_SOFT } } } }
  });

  // Pie chart
  var projectSums = {};
  projectNames.forEach(function(n) { projectSums[n] = sum(projects[n]); });
  var sortedProjects = Object.entries(projectSums).sort(function(a,b) { return b[1]-a[1]; });

  destroyChart('pie');
  chartInstances['pie'] = new Chart(document.getElementById('chartPie'), {
    type: 'doughnut',
    data: { labels: sortedProjects.map(function(p) { return p[0]; }), datasets: [{ data: sortedProjects.map(function(p) { return p[1]; }), backgroundColor: CHART_COLORS.slice(0, sortedProjects.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, padding: 8 } }, tooltip: { callbacks: { label: function(ctx) { var t = ctx.dataset.data.reduce(function(a,b) { return a+b; }, 0); return ctx.label + ': ' + fmt(ctx.raw) + ' (' + (ctx.raw/t*100).toFixed(1) + '%)'; } } } } }
  });

  // Project table
  var allProjects = [];
  accountNames.forEach(function(accName) {
    var acc = data.accounts[accName];
    Object.keys(acc.projects).filter(function(k) { return k !== '合计'; }).forEach(function(name) {
      allProjects.push({ name: name, data: acc.projects[name], account: accName });
    });
  });
  allProjects.sort(function(a,b) { return sum(b.data) - sum(a.data); });

  var tbody = document.getElementById('projectTableBody');
  tbody.innerHTML = '';
  allProjects.forEach(function(p) {
    var valid = p.data.filter(function(x) { return x != null; });
    var s = sum(valid), m = mean(valid), cvVal = cv(valid);
    var mx = valid.length ? arrMax(valid) : 0;
    var mn = valid.length ? arrMin(valid) : 0;
    var level, badgeClass;
    if (s > 500000) { level = '高消耗'; badgeClass = 'badge-high'; }
    else if (s > 50000) { level = '中消耗'; badgeClass = 'badge-mid'; }
    else { level = '低消耗'; badgeClass = 'badge-low'; }
    var trendText = '-';
    if (valid.length >= 7) {
      var ratio = mean(valid.slice(-7)) / mean(valid.slice(0, 7));
      if (ratio > 1.15) trendText = '上升';
      else if (ratio < 0.85) trendText = '下降';
      else trendText = '平稳';
    } else if (valid.length > 0) { trendText = '数据不足'; }
    var row = document.createElement('tr');
    row.innerHTML = '<td class="pl4"><strong>' + p.name + '</strong></td><td>' + p.account + '</td><td class="num">' + fmt(s) + '</td><td class="num">' + fmt(m) + '</td><td class="num">' + fmt(mx) + '</td><td class="num">' + (mn > 0 ? fmt(mn) : '-') + '</td><td class="num">' + (cvVal > 0 ? cvVal.toFixed(1) + '%' : '-') + '</td><td><span class="badge ' + badgeClass + '">' + level + '</span></td><td class="pr4">' + trendText + '</td>';
    tbody.appendChild(row);
  });

  // Compare chart
  var topProjects = sortedProjects.slice(0, 4);
  destroyChart('compare');
  chartInstances['compare'] = new Chart(document.getElementById('chartCompare'), {
    type: 'line',
    data: { labels: dates, datasets: topProjects.map(function(p, i) { return { label: p[0], data: projects[p[0]], borderColor: CHART_COLORS[i], backgroundColor: 'transparent', tension: 0.3, pointRadius: 1.5, pointHoverRadius: 4, borderWidth: 1.5 }; }) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14 } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { ticks: { callback: function(v) { return fmtShort(v); } }, grid: { color: CANVAS_SOFT } } } }
  });

  // Account comparison
  var accountGrid = document.getElementById('accountGrid');
  accountGrid.innerHTML = '';
  accountNames.forEach(function(accName, idx) {
    var acc = data.accounts[accName];
    var accTotal = acc.projects['合计'] || [];
    var cardId = 'accChart' + idx;
    var div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = '<div class="card-head"><div class="card-title">' + accName + '</div></div><div class="chart-wrap medium"><canvas id="' + cardId + '"></canvas></div><div class="stat-row" id="accStats' + idx + '"></div>';
    accountGrid.appendChild(div);

    destroyChart(cardId);
    chartInstances[cardId] = new Chart(document.getElementById(cardId), {
      type: 'bar',
      data: { labels: acc.dates, datasets: [{ data: accTotal, backgroundColor: CHART_COLORS_ALPHA[idx] || 'rgba(83,58,253,0.50)', borderRadius: 2, borderSkipped: false }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { ticks: { callback: function(v) { return fmtShort(v); } }, grid: { color: CANVAS_SOFT } } } }
    });
    var projCount = Object.keys(acc.projects).filter(function(k) { return k !== '合计'; }).length;
    document.getElementById('accStats' + idx).innerHTML = '<span class="stat-chip">累计 ' + fmt(sum(accTotal)) + '</span><span class="stat-chip">日均 ' + fmt(mean(accTotal)) + '</span><span class="stat-chip">' + projCount + ' 个项目</span>';
  });

  // Weekday chart
  var weekdayNames = ['周日','周一','周二','周三','周四','周五','周六'];
  var weekdayData = [0,0,0,0,0,0,0], weekdayCount = [0,0,0,0,0,0,0];
  dates.forEach(function(d, i) {
    var parts = d.split('/');
    var day = new Date(2025, parseInt(parts[0]) - 1, parseInt(parts[1])).getDay();
    if (szTotal[i] !== null) { weekdayData[day] += szTotal[i]; weekdayCount[day]++; }
  });
  var weekdayAvg = weekdayData.map(function(s, i) { return weekdayCount[i] ? s / weekdayCount[i] : 0; });

  destroyChart('weekday');
  chartInstances['weekday'] = new Chart(document.getElementById('chartWeekday'), {
    type: 'bar',
    data: { labels: weekdayNames, datasets: [{ data: weekdayAvg, backgroundColor: weekdayAvg.map(function(_, i) { return i === 0 || i === 6 ? 'rgba(230,168,23,0.45)' : 'rgba(83,58,253,0.50)'; }), borderRadius: 2, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return fmtShort(v); } }, grid: { color: CANVAS_SOFT } } } }
  });

  // Period chart
  var totalLen = szTotal.length;
  var third = Math.floor(totalLen / 3);
  var periodData = [mean(szTotal.slice(0, third)), mean(szTotal.slice(third, third*2)), mean(szTotal.slice(third*2))];

  destroyChart('period');
  chartInstances['period'] = new Chart(document.getElementById('chartPeriod'), {
    type: 'bar',
    data: { labels: ['前段', '中段', '后段'], datasets: [{ data: periodData, backgroundColor: ['rgba(83,58,253,0.50)', 'rgba(83,58,253,0.35)', 'rgba(83,58,253,0.20)'], borderRadius: 2, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return fmtShort(v); } }, grid: { color: CANVAS_SOFT } } } }
  });

  // Descriptive stats
  var validTotal = szTotal.filter(function(x) { return x !== null; });
  var top3 = sortedProjects.slice(0, 3);
  var statsHtml = '<table class="data-table"><tr><th>统计量</th><th class="num">总消耗</th>';
  top3.forEach(function(p) { statsHtml += '<th class="num">' + p[0] + '</th>'; });
  statsHtml += '</tr>';
  ['样本量','均值','中位数','标准差','变异系数','最大值','最小值'].forEach(function(label) {
    statsHtml += '<tr><td>' + label + '</td><td class="num">';
    if (label === '样本量') { statsHtml += validTotal.length; top3.forEach(function(p) { statsHtml += '</td><td class="num">' + projects[p[0]].filter(function(x){return x!==null;}).length; }); }
    else if (label === '均值') { statsHtml += fmt(mean(validTotal)); top3.forEach(function(p) { statsHtml += '</td><td class="num">' + fmt(mean(projects[p[0]])); }); }
    else if (label === '中位数') { statsHtml += fmt(median(validTotal)); top3.forEach(function(p) { statsHtml += '</td><td class="num">' + fmt(median(projects[p[0]])); }); }
    else if (label === '标准差') { statsHtml += fmt(std(validTotal)); top3.forEach(function(p) { statsHtml += '</td><td class="num">' + fmt(std(projects[p[0]])); }); }
    else if (label === '变异系数') { statsHtml += cv(validTotal).toFixed(1) + '%'; top3.forEach(function(p) { statsHtml += '</td><td class="num">' + cv(projects[p[0]]).toFixed(1) + '%'; }); }
    else if (label === '最大值') { statsHtml += fmt(arrMax(validTotal)); top3.forEach(function(p) { statsHtml += '</td><td class="num">' + fmt(arrMax(projects[p[0]].filter(function(x){return x!==null;}))); }); }
    else if (label === '最小值') { statsHtml += fmt(arrMin(validTotal)); top3.forEach(function(p) { statsHtml += '</td><td class="num">' + fmt(arrMin(projects[p[0]].filter(function(x){return x!==null && x>0;}))); }); }
    statsHtml += '</td></tr>';
  });
  statsHtml += '</table>';
  document.getElementById('descStats').innerHTML = statsHtml;

  // Trend analysis
  var trendRows = allProjects.map(function(p) {
    var valid = p.data.filter(function(x) { return x !== null; });
    if (valid.length < 7) return '<tr><td>' + p.name + '</td><td class="num">' + valid.length + '</td><td>-</td><td>数据不足</td></tr>';
    var ratio = mean(valid.slice(-7)) / mean(valid.slice(0, 7));
    var dir, dirStyle;
    if (ratio > 1.15) { dir = '上升 (' + (ratio*100).toFixed(0) + '%)'; dirStyle = 'color:#0ca678'; }
    else if (ratio < 0.85) { dir = '下降 (' + (ratio*100).toFixed(0) + '%)'; dirStyle = 'color:#e03131'; }
    else { dir = '平稳 (' + (ratio*100).toFixed(0) + '%)'; dirStyle = 'color:#64748d'; }
    var anomalies = valid.filter(function(x) { return Math.abs(x - mean(valid)) > 2 * std(valid); }).length;
    return '<tr><td>' + p.name + '</td><td class="num">' + valid.length + '</td><td style="' + dirStyle + '">' + dir + '</td><td class="num">' + anomalies + ' 个</td></tr>';
  }).join('');
  document.getElementById('trendAnalysis').innerHTML = '<table class="data-table"><thead><tr><th>项目</th><th class="num">有效天数</th><th>趋势判定</th><th class="num">异常点数</th></tr></thead><tbody>' + trendRows + '</tbody></table>';
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-pane').forEach(function(c) { c.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});
