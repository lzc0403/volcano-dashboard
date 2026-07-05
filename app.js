// ============ 火山业务数据看板 - Dashboard 风格 ============

const PRIMARY = '#2BAE85';
const PRIMARY_DEEP = '#1a8f6a';
const GREEN_UP = '#10b981';
const RED_DOWN = '#ef4444';
const AMBER = '#f59e0b';
const BLUE_INFO = '#3b82f6';
const BG_MUTED = '#f8f9fa';
const BORDER = '#e5e7eb';
const TEXT_MUTED = '#666666';
const TEXT_LABEL = '#999999';

const CHART_COLORS = [PRIMARY, BLUE_INFO, AMBER, '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

let chartTrend = null;
let chartPie = null;
let chartMonthCompare = null;
let chartWeekly = null;

function fmt(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '-';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function fmtCompact(n) {
  if (n == null || isNaN(n)) return '-';
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
  return fmt(n);
}

function renderDashboard(data) {
  const accounts = data.accounts || {};
  const genTime = new Date(data.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // Collect all data
  const allDates = new Set();
  const accountTotals = {};
  const accountDetails = {};
  const projectList = [];

  Object.entries(accounts).forEach(([accName, acc]) => {
    const dates = acc.dates || [];
    const projects = acc.projects || {};
    dates.forEach(d => allDates.add(d));

    // Calculate account total (using 合计 row if available, otherwise sum)
    let accTotal = 0;
    let activeDays = 0;
    const dailyTotals = {};

    Object.entries(projects).forEach(([projName, values]) => {
      if (projName === '合计' || projName === '空') return;
      let projTotal = 0;
      let projDays = 0;
      let projMax = 0;
      let projMin = Infinity;

      values.forEach((v, i) => {
        const dayTotal = dailyTotals[dates[i]] || 0;
        if (v != null && v > 0) {
          dailyTotals[dates[i]] = dayTotal + v;
          projTotal += v;
          projDays++;
          if (v > projMax) projMax = v;
          if (v < projMin) projMin = v;
        }
      });

      if (projTotal > 0) {
        projectList.push({
          name: projName,
          account: accName,
          total: projTotal,
          days: projDays,
          daily: projDays > 0 ? projTotal / projDays : 0,
          max: projMax,
          min: projMin === Infinity ? 0 : projMin
        });
      }
    });

    // Use 合计 if available, otherwise sum daily totals
    const heji = projects['合计'];
    if (heji) {
      accTotal = heji.reduce((s, v) => s + (v || 0), 0);
      activeDays = heji.filter(v => v != null && v > 0).length;
    } else {
      accTotal = Object.values(dailyTotals).reduce((s, v) => s + v, 0);
      activeDays = Object.values(dailyTotals).filter(v => v > 0).length;
    }

    accountTotals[accName] = accTotal;
    accountDetails[accName] = {
      total: accTotal,
      activeDays,
      dates,
      heji: heji || dates.map(d => dailyTotals[d] || 0),
      projectCount: Object.keys(projects).filter(k => k !== '合计' && k !== '空').length
    };
  });

  const sortedDates = [...allDates].sort((a, b) => {
    const [am, ad] = a.split('/').map(Number);
    const [bm, bd] = b.split('/').map(Number);
    return am - bm || ad - bd;
  });

  const grandTotal = Object.values(accountTotals).reduce((s, v) => s + v, 0);
  const activeProjectCount = projectList.length;
  const activeDateCount = sortedDates.filter(d => {
    return Object.values(accountDetails).some(acc => {
      const idx = acc.dates.indexOf(d);
      return idx >= 0 && acc.heji[idx] != null && acc.heji[idx] > 0;
    });
  }).length;

  // Calculate daily totals
  const dailyData = sortedDates.map(d => {
    let total = 0;
    const byAccount = {};
    Object.entries(accountDetails).forEach(([name, acc]) => {
      const idx = acc.dates.indexOf(d);
      const val = idx >= 0 ? (acc.heji[idx] || 0) : 0;
      byAccount[name] = val;
      total += val;
    });
    return { date: d, total, ...byAccount };
  });

  // Growth rate (last active day vs previous)
  const activeDays = dailyData.filter(d => d.total > 0);
  let growthRate = null;
  if (activeDays.length >= 2) {
    const last = activeDays[activeDays.length - 1];
    const prev = activeDays[activeDays.length - 2];
    if (prev.total > 0) {
      growthRate = (last.total - prev.total) / prev.total * 100;
    }
  }

  // ===== Render Header =====
  document.getElementById('dataRange').textContent = `数据区间 ${sortedDates[0] || '-'} ~ ${sortedDates[sortedDates.length - 1] || '-'}`;
  document.getElementById('genTime').textContent = `更新时间 ${genTime}`;

  // ===== Render Stat Row =====
  document.getElementById('statTotal').textContent = fmtCompact(grandTotal);
  const avgDaily = activeDateCount > 0 ? grandTotal / activeDateCount : 0;
  document.getElementById('statDaily').textContent = fmtCompact(avgDaily);
  document.getElementById('statProjects').textContent = activeProjectCount;

  const projChangeEl = document.getElementById('statProjectsChange');
  projChangeEl.textContent = `${activeProjectCount} 个有数据`;
  projChangeEl.className = 'stat-change neutral';

  const growthEl = document.getElementById('statGrowth');
  const growthChangeEl = document.getElementById('statGrowthChange');
  if (growthRate != null) {
    growthEl.textContent = fmtPct(growthRate);
    growthEl.style.color = growthRate >= 0 ? GREEN_UP : RED_DOWN;
    if (activeDays.length >= 2) {
      growthChangeEl.textContent = `${fmtCompact(activeDays[activeDays.length - 1].total)} vs ${fmtCompact(activeDays[activeDays.length - 2].total)}`;
    }
    growthChangeEl.className = 'stat-change ' + (growthRate >= 0 ? 'up' : 'down');
  } else {
    growthEl.textContent = '-';
    growthChangeEl.textContent = '数据不足';
    growthChangeEl.className = 'stat-change neutral';
  }

  // Total change
  const totalChangeEl = document.getElementById('statTotalChange');
  totalChangeEl.textContent = `${activeDateCount} 天有效数据`;
  totalChangeEl.className = 'stat-change up';

  const dailyChangeEl = document.getElementById('statDailyChange');
  dailyChangeEl.textContent = `${activeProjectCount} 个项目汇总`;
  dailyChangeEl.className = 'stat-change neutral';

  // ===== Section 01: Trend Chart =====
  document.getElementById('trendBadge').textContent = `${sortedDates.length} 天`;
  document.getElementById('trendSummary').textContent = `7日均线 · 95% CI`;

  const ctxTrend = document.getElementById('chartTrend').getContext('2d');
  if (chartTrend) chartTrend.destroy();

  const validData = dailyData.filter(d => d.total > 0);
  const trendLabels = dailyData.map(d => d.date);
  const trendValues = dailyData.map(d => d.total);

  // 7-day moving average
  const ma7 = trendValues.map((_, i) => {
    const start = Math.max(0, i - 6);
    const slice = trendValues.slice(start, i + 1).filter(v => v > 0);
    return slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0;
  });

  chartTrend = new Chart(ctxTrend, {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [
        {
          label: '每日总消耗',
          data: trendValues,
          borderColor: PRIMARY,
          backgroundColor: 'rgba(43,174,133,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: PRIMARY,
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        },
        {
          label: '7日均线',
          data: ma7,
          borderColor: BLUE_INFO,
          borderDash: [5, 5],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { font: { size: 12 }, color: TEXT_MUTED, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': ' + fmt(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { color: BG_MUTED },
          ticks: { color: TEXT_LABEL, font: { size: 11 } }
        },
        y: {
          grid: { color: BG_MUTED },
          ticks: {
            color: TEXT_LABEL,
            font: { size: 11 },
            callback: v => fmtCompact(v)
          }
        }
      }
    }
  });

  // Pie chart - project distribution
  const topProjects = [...projectList].sort((a, b) => b.total - a.total).slice(0, 8);
  document.getElementById('pieSummary').textContent = `Top ${topProjects.length}`;

  const ctxPie = document.getElementById('chartPie').getContext('2d');
  if (chartPie) chartPie.destroy();

  chartPie = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels: topProjects.map(p => p.name),
      datasets: [{
        data: topProjects.map(p => p.total),
        backgroundColor: CHART_COLORS,
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, color: TEXT_MUTED, usePointStyle: true, padding: 8 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.label + ': ' + fmt(ctx.parsed)
          }
        }
      },
      cutout: '60%'
    }
  });

  // ===== Section 02: Project Table =====
  document.getElementById('projectCount').textContent = `${projectList.length} 个项目`;
  const tbody = document.getElementById('projectTableBody');
  const sortedProjects = [...projectList].sort((a, b) => b.total - a.total);
  const maxTotal = sortedProjects[0]?.total || 1;

  tbody.innerHTML = sortedProjects.map(p => {
    const pct = (p.total / grandTotal * 100).toFixed(1);
    const barWidth = (p.total / maxTotal * 100).toFixed(0);
    let badgeClass = 'badge-green';
    let badgeText = '正常';
    if (p.total < 100) { badgeClass = 'badge-gray'; badgeText = '微量'; }
    else if (p.total < 1000) { badgeClass = 'badge-amber'; badgeText = '低量'; }
    return `<tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.account}</td>
      <td class="num">${fmt(p.total)}</td>
      <td class="num">${fmt(p.daily)}</td>
      <td class="num">${fmt(p.max)}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${barWidth}%"></div></div>
          <span class="progress-label">${pct}%</span>
        </div>
      </td>
      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
    </tr>`;
  }).join('');

  // ===== Section 03: Account Cards =====
  const accContainer = document.getElementById('accountCards');
  accContainer.innerHTML = Object.entries(accountDetails).map(([name, acc]) => {
    return `<div class="account-card">
      <div class="acc-name">${name} <span class="badge badge-blue">${acc.projectCount} 项目</span></div>
      <div class="acc-total">${fmtCompact(acc.total)}</div>
      <div class="acc-detail">
        <div class="acc-row"><span class="acc-label">活跃天数</span><span class="acc-val">${acc.activeDays} 天</span></div>
        <div class="acc-row"><span class="acc-label">日均消耗</span><span class="acc-val">${fmtCompact(acc.activeDays > 0 ? acc.total / acc.activeDays : 0)}</span></div>
        <div class="acc-row"><span class="acc-label">数据天数</span><span class="acc-val">${acc.dates.length} 天</span></div>
      </div>
    </div>`;
  }).join('');

  // ===== Section 04: Data Quality =====
  document.getElementById('qualityPeriod').textContent = `${sortedDates[0] || '-'} ~ ${sortedDates[sortedDates.length - 1] || '-'}`;
  document.getElementById('qualityDays').textContent = `${sortedDates.length} 天`;

  // Quality score: active days / total days
  const qualityPct = sortedDates.length > 0 ? (activeDateCount / sortedDates.length * 100).toFixed(0) : 0;
  const qualityEl = document.getElementById('qualityScore');
  qualityEl.textContent = qualityPct + '%';
  if (qualityPct >= 80) qualityEl.className = 'mini-value green';
  else if (qualityPct >= 50) qualityEl.className = 'mini-value amber';
  else qualityEl.className = 'mini-value red';

  // Descriptive statistics → 大白话版
  const validTotals = dailyData.filter(d => d.total > 0).map(d => d.total);
  if (validTotals.length > 0) {
    const mean = validTotals.reduce((s, v) => s + v, 0) / validTotals.length;
    const sorted = [...validTotals].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const variance = validTotals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / validTotals.length;
    const std = Math.sqrt(variance);
    const n = validTotals.length;
    const ciMargin = n > 1 ? 1.96 * std / Math.sqrt(n) : 0;
    const dayMax = Math.max(...validTotals);
    const dayMin = Math.min(...validTotals);
    const cv = mean > 0 ? std / mean : 0; // 变异系数

    // 每天平均花多少
    document.getElementById('statsMean').textContent = fmtCompact(mean);

    // 典型一天花多少
    document.getElementById('statsMedian').textContent = fmtCompact(median);

    // 花钱稳不稳定 — 用变异系数判断
    const volEl = document.getElementById('statsVolatility');
    if (cv < 0.2) {
      volEl.innerHTML = '很稳定 <span class="badge badge-green">波动小</span>';
    } else if (cv < 0.5) {
      volEl.innerHTML = '有起伏 <span class="badge badge-amber">适中</span>';
    } else {
      volEl.innerHTML = '波动大 <span class="badge badge-red">不稳定</span>';
    }

    // 正常花销范围 — 95% CI 用大白话展示
    document.getElementById('statsRange').textContent = `${fmtCompact(mean - ciMargin)} ~ ${fmtCompact(mean + ciMargin)}`;

    // 最多/最少一天
    document.getElementById('statsMax').textContent = fmtCompact(dayMax);
    document.getElementById('statsMin').textContent = fmtCompact(dayMin);
  }

  // ===== Section 05: Daily Table =====
  document.getElementById('dailyBadge').textContent = `${dailyData.length} 天`;
  document.getElementById('dailySummary').textContent = `${dailyData.filter(d => d.total > 0).length} 天有效`;

  const dailyBody = document.getElementById('dailyTableBody');
  dailyBody.innerHTML = dailyData.map((d, i) => {
    const prev = i > 0 ? dailyData[i - 1] : null;
    let growthBadge = '<span class="badge badge-gray">-</span>';
    if (prev && prev.total > 0 && d.total > 0) {
      const g = (d.total - prev.total) / prev.total * 100;
      if (g > 5) growthBadge = `<span class="badge badge-green">+${g.toFixed(1)}%</span>`;
      else if (g < -5) growthBadge = `<span class="badge badge-red">${g.toFixed(1)}%</span>`;
      else growthBadge = `<span class="badge badge-blue">${g >= 0 ? '+' : ''}${g.toFixed(1)}%</span>`;
    } else if (d.total > 0 && (!prev || prev.total === 0)) {
      growthBadge = '<span class="badge badge-amber">新增</span>';
    }

    const sz = d['深圳帐号'] || 0;
    const gz = d['贵州'] || 0;
    const aly = d['阿里云'] || 0;
    const rowClass = d.total > 0 ? '' : 'style="color:var(--text-label)"';

    return `<tr ${rowClass}>
      <td>${d.date}</td>
      <td class="num">${sz > 0 ? fmt(sz) : '-'}</td>
      <td class="num">${gz > 0 ? fmt(gz) : '-'}</td>
      <td class="num">${aly > 0 ? fmt(aly) : '-'}</td>
      <td class="num"><strong>${d.total > 0 ? fmt(d.total) : '-'}</strong></td>
      <td>${growthBadge}</td>
    </tr>`;
  }).join('');

  // ===== Footer =====
  document.getElementById('footerRefresh').textContent = `自动刷新 · ${genTime}`;

  // ===== Section 05: Month-over-Month =====
  renderMonthComparison(data);

  // ===== Section 06: Concentration & Weekly =====
  renderConcentration(projectList, grandTotal);
  renderWeeklyPattern(dailyData);
}

// ============ 月度对比 ============
function renderMonthComparison(data) {
  const months = data.months;
  if (!months) return;

  const juneAcc = months.june?.accounts?.['深圳帐号'];
  const julyAcc = months.july?.accounts?.['深圳帐号'];
  if (!juneAcc && !julyAcc) return;

  // 6月统计
  let juneTotal = 0, juneDays = 0, juneProjectSet = new Set();
  const juneProjectTotals = {};
  if (juneAcc) {
    const heji = juneAcc.projects['合计'] || [];
    heji.forEach(v => { if (v != null && v > 0) { juneTotal += v; juneDays++; } });
    Object.entries(juneAcc.projects).forEach(([name, vals]) => {
      if (name === '合计' || name === '空') return;
      const t = vals.reduce((s, v) => s + (v || 0), 0);
      if (t > 0) { juneProjectTotals[name] = t; juneProjectSet.add(name); }
    });
  }

  // 7月统计
  let julyTotal = 0, julyDays = 0, julyProjectSet = new Set();
  const julyProjectTotals = {};
  if (julyAcc) {
    const heji = julyAcc.projects['合计'] || [];
    heji.forEach(v => { if (v != null && v > 0) { julyTotal += v; julyDays++; } });
    Object.entries(julyAcc.projects).forEach(([name, vals]) => {
      if (name === '合计' || name === '空') return;
      const t = vals.reduce((s, v) => s + (v || 0), 0);
      if (t > 0) { julyProjectTotals[name] = t; julyProjectSet.add(name); }
    });
  }

  // 渲染 4 张对比卡
  document.getElementById('momJuneTotal').textContent = fmtCompact(juneTotal);
  document.getElementById('momJuneDays').textContent = `${juneDays} 天有效数据`;
  document.getElementById('momJulyTotal').textContent = fmtCompact(julyTotal);
  document.getElementById('momJulyDays').textContent = `${julyDays} 天有效数据`;

  // 日均对比
  const juneDaily = juneDays > 0 ? juneTotal / juneDays : 0;
  const julyDaily = julyDays > 0 ? julyTotal / julyDays : 0;
  const dailyDiff = juneDaily > 0 ? ((julyDaily - juneDaily) / juneDaily * 100) : 0;
  document.getElementById('momDailyChange').textContent = fmtPct(dailyDiff);
  document.getElementById('momDailyChange').style.color = dailyDiff >= 0 ? GREEN_UP : RED_DOWN;
  const dailyBadgeEl = document.getElementById('momDailyBadge');
  dailyBadgeEl.textContent = `6月日均 ${fmtCompact(juneDaily)} → 7月日均 ${fmtCompact(julyDaily)}`;
  dailyBadgeEl.className = 'stat-change ' + (dailyDiff >= 0 ? 'up' : 'down');

  // 项目变化
  const newProjects = [...julyProjectSet].filter(p => !juneProjectSet.has(p));
  const removedProjects = [...juneProjectSet].filter(p => !julyProjectSet.has(p));
  const netChange = julyProjectSet.size - juneProjectSet.size;
  document.getElementById('momProjectChange').textContent = (netChange >= 0 ? '+' : '') + netChange;
  document.getElementById('momProjectChange').style.color = netChange >= 0 ? GREEN_UP : RED_DOWN;
  let projDetail = `${juneProjectSet.size} → ${julyProjectSet.size} 个`;
  if (newProjects.length > 0) projDetail += ` · 新增 ${newProjects.length}`;
  if (removedProjects.length > 0) projDetail += ` · 减少 ${removedProjects.length}`;
  document.getElementById('momProjectDetail').textContent = projDetail;

  // 双月走势对比图 — 按日对齐
  const maxDays = Math.max(
    juneAcc?.dates?.length || 0,
    julyAcc?.dates?.length || 0
  );
  const dayLabels = Array.from({ length: maxDays }, (_, i) => '第' + (i + 1) + '天');
  const juneHeji = juneAcc?.projects['合计'] || [];
  const julyHeji = julyAcc?.projects['合计'] || [];
  const juneSeries = Array.from({ length: maxDays }, (_, i) => juneHeji[i] || 0);
  const julySeries = Array.from({ length: maxDays }, (_, i) => julyHeji[i] || 0);

  const ctxMC = document.getElementById('chartMonthCompare').getContext('2d');
  if (chartMonthCompare) chartMonthCompare.destroy();
  chartMonthCompare = new Chart(ctxMC, {
    type: 'line',
    data: {
      labels: dayLabels,
      datasets: [
        { label: '6月', data: juneSeries, borderColor: BLUE_INFO, backgroundColor: 'rgba(59,130,246,0.1)', fill: false, tension: 0.3, pointRadius: 3, pointBackgroundColor: BLUE_INFO },
        { label: '7月', data: julySeries, borderColor: PRIMARY, backgroundColor: 'rgba(43,174,133,0.1)', fill: false, tension: 0.3, pointRadius: 3, pointBackgroundColor: PRIMARY }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12 }, color: TEXT_MUTED, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ' 第' + (ctx.dataIndex + 1) + '天: ' + fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { color: BG_MUTED }, ticks: { color: TEXT_LABEL, font: { size: 11 } } },
        y: { grid: { color: BG_MUTED }, ticks: { color: TEXT_LABEL, font: { size: 11 }, callback: v => fmtCompact(v) } }
      }
    }
  });

  // 项目排名变化表
  const allProjNames = new Set([...Object.keys(juneProjectTotals), ...Object.keys(julyProjectTotals)]);
  const rankData = [...allProjNames].map(name => ({
    name,
    june: juneProjectTotals[name] || 0,
    july: julyProjectTotals[name] || 0
  }));
  // 计算排名
  const juneRanked = [...rankData].filter(p => p.june > 0).sort((a, b) => b.june - a.june);
  const julyRanked = [...rankData].filter(p => p.july > 0).sort((a, b) => b.july - a.july);
  const juneRank = {};
  juneRanked.forEach((p, i) => juneRank[p.name] = i + 1);
  const julyRank = {};
  julyRanked.forEach((p, i) => julyRank[p.name] = i + 1);

  // 按七月消耗排序
  const sortedRank = rankData.sort((a, b) => (b.july || 0) - (a.july || 0));
  const rankBody = document.getElementById('rankTableBody');
  rankBody.innerHTML = sortedRank.map(p => {
    const jRank = juneRank[p.name];
    const julyR = julyRank[p.name];
    let changeBadge = '<span class="badge badge-gray">新增</span>';
    if (jRank && julyR) {
      const diff = jRank - julyR; // 正数=上升
      if (diff > 0) changeBadge = `<span class="badge badge-green">↑ 上升 ${diff} 位</span>`;
      else if (diff < 0) changeBadge = `<span class="badge badge-red">↓ 下降 ${-diff} 位</span>`;
      else changeBadge = '<span class="badge badge-blue">— 持平</span>';
    } else if (!jRank && !julyR) {
      changeBadge = '<span class="badge badge-gray">无数据</span>';
    } else if (!jRank) {
      changeBadge = '<span class="badge badge-amber">7月新增</span>';
    } else {
      changeBadge = '<span class="badge badge-gray">7月无消耗</span>';
    }
    return `<tr>
      <td><strong>${p.name}</strong></td>
      <td class="num">${p.june > 0 ? fmt(p.june) : '-'}</td>
      <td class="num">${p.july > 0 ? fmt(p.july) : '-'}</td>
      <td class="num">${jRank || '-'}</td>
      <td class="num">${julyR || '-'}</td>
      <td>${changeBadge}</td>
    </tr>`;
  }).join('');
}

// ============ 消耗集中度 ============
function renderConcentration(projectList, grandTotal) {
  const container = document.getElementById('concentrationPanel');
  if (!container || projectList.length === 0) return;

  const sorted = [...projectList].sort((a, b) => b.total - a.total);
  const maxVal = sorted[0].total;
  const totalProjects = sorted.length;

  // 计算 Top 3 占比
  const top3Total = sorted.slice(0, 3).reduce((s, p) => s + p.total, 0);
  const top3Pct = grandTotal > 0 ? (top3Total / grandTotal * 100).toFixed(1) : 0;

  // 集中度判断
  let concLevel = '分散', concColor = 'badge-green', concDesc = '消耗分布均匀，没有过度依赖单一项目';
  if (top3Pct >= 90) { concLevel = '高度集中'; concColor = 'badge-red'; concDesc = '消耗极度集中在前3个项目，风险较高'; }
  else if (top3Pct >= 75) { concLevel = '较集中'; concColor = 'badge-amber'; concDesc = '消耗主要集中在前3个项目，需关注依赖风险'; }

  const rankColors = [PRIMARY, BLUE_INFO, AMBER, '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#10b981', '#ef4444'];

  let html = sorted.slice(0, 10).map((p, i) => {
    const pct = grandTotal > 0 ? (p.total / grandTotal * 100) : 0;
    const barWidth = (p.total / maxVal * 100);
    const color = rankColors[i % rankColors.length];
    return `<div class="conc-item">
      <div class="conc-rank" style="background:${color}">${i + 1}</div>
      <div class="conc-info">
        <div class="conc-name">${p.name} <span style="color:var(--text-label);font-size:11px">${p.account}</span></div>
        <div class="conc-bar"><div class="conc-fill" style="width:${barWidth}%;background:${color}"></div></div>
      </div>
      <div class="conc-amount">${fmtCompact(p.total)}<br><span style="font-size:11px;color:var(--text-label)">${pct.toFixed(1)}%</span></div>
    </div>`;
  }).join('');

  html += `<div class="conc-summary">
    <strong>集中度判断：</strong><span class="badge ${concColor}">${concLevel}</span><br>
    前3个项目占总消耗的 <strong>${top3Pct}%</strong>，共 ${totalProjects} 个项目有消耗。<br>
    ${concDesc}
  </div>`;

  container.innerHTML = html;
}

// ============ 周内规律 ============
function renderWeeklyPattern(dailyData) {
  // 把日期映射到星期几
  // 假设 6/1/2026 是星期一, 7/1/2026 是星期三
  // 2026-06-01 是 Monday (实际计算)
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]; // 0=Sunday
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

  dailyData.forEach(d => {
    if (d.total <= 0) return;
    const [month, day] = d.date.split('/').map(Number);
    // 2026年: 6/1 = 周一, 7/1 = 周三
    const date = new Date(2026, month - 1, day);
    const dow = date.getDay();
    weekdayTotals[dow] += d.total;
    weekdayCounts[dow]++;
  });

  // 计算日均
  const weekdayAvg = weekdayTotals.map((t, i) => weekdayCounts[i] > 0 ? t / weekdayCounts[i] : 0);

  // 找到最高和最低
  const maxAvg = Math.max(...weekdayAvg.filter(v => v > 0));
  const minAvg = Math.min(...weekdayAvg.filter(v => v > 0));
  const maxDay = dayNames[weekdayAvg.indexOf(maxAvg)];
  const minDay = dayNames[weekdayAvg.indexOf(minAvg)];

  const ctxW = document.getElementById('chartWeekly').getContext('2d');
  if (chartWeekly) chartWeekly.destroy();
  chartWeekly = new Chart(ctxW, {
    type: 'bar',
    data: {
      labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      datasets: [{
        label: '日均消耗',
        data: [weekdayAvg[1], weekdayAvg[2], weekdayAvg[3], weekdayAvg[4], weekdayAvg[5], weekdayAvg[6], weekdayAvg[0]],
        backgroundColor: [weekdayAvg[1], weekdayAvg[2], weekdayAvg[3], weekdayAvg[4], weekdayAvg[5], weekdayAvg[6], weekdayAvg[0]].map(v => v === maxAvg ? AMBER : PRIMARY),
        borderRadius: 6,
        barThickness: 32
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => '日均: ' + fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: TEXT_MUTED, font: { size: 12 } } },
        y: { grid: { color: BG_MUTED }, ticks: { color: TEXT_LABEL, font: { size: 11 }, callback: v => fmtCompact(v) } }
      }
    }
  });
}
