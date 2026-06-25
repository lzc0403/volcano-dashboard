#!/usr/bin/env node
/**
 * server.js
 * 火山业务数据 Dashboard HTTP 服务器
 * - 提供静态文件服务
 * - 每小时自动刷新数据（9:00-21:00）
 * - 端口: 8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const REFRESH_SCRIPT = path.join(ROOT, 'refresh-data.js');

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ===================== DATA REFRESH =====================
let lastRefreshTime = null;
let refreshInProgress = false;

function refreshData() {
  if (refreshInProgress) {
    console.log('[跳过] 刷新正在进行中...');
    return;
  }
  refreshInProgress = true;
  console.log(`[${new Date().toISOString()}] 开始刷新数据...`);

  try {
    const nodePath = process.execPath;
    execSync(`"${nodePath}" "${REFRESH_SCRIPT}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, PATH: process.env.PATH }
    });
    lastRefreshTime = new Date();
    console.log(`[${lastRefreshTime.toISOString()}] 数据刷新完成`);
  } catch (e) {
    console.error(`[刷新失败] ${e.message}`);
  } finally {
    refreshInProgress = false;
  }
}

// ===================== SCHEDULER =====================
function checkAndRefresh() {
  const now = new Date();
  const hour = now.getHours();
  // 每天 9:00 - 21:00 之间，每小时刷新一次
  if (hour >= 9 && hour <= 21) {
    // 检查是否已经在这个小时刷新过了
    if (!lastRefreshTime || lastRefreshTime.getHours() !== hour || lastRefreshTime.getDate() !== now.getDate()) {
      refreshData();
    }
  }
}

// 每分钟检查一次是否需要刷新
setInterval(checkAndRefresh, 60000);

// 启动时如果在工作时间内，立即刷新
const startHour = new Date().getHours();
if (startHour >= 9 && startHour <= 21) {
  // 如果 data.json 不存在或过期（>2小时），立即刷新
  if (!fs.existsSync(DATA_FILE)) {
    console.log('[启动] data.json 不存在，立即刷新...');
    refreshData();
  } else {
    const stat = fs.statSync(DATA_FILE);
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
    if (ageHours > 2) {
      console.log(`[启动] data.json 已过期 (${ageHours.toFixed(1)}h)，立即刷新...`);
      refreshData();
    }
  }
}

// ===================== HTTP SERVER =====================
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // API: 手动刷新
  if (urlPath === '/api/refresh' && req.method === 'POST') {
    refreshData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, time: lastRefreshTime }));
    return;
  }

  // API: 状态
  if (urlPath === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      lastRefresh: lastRefreshTime,
      dataExists: fs.existsSync(DATA_FILE),
      nextRefresh: getNextRefreshTime()
    }));
    return;
  }

  // 静态文件
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + urlPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    const headers = { 'Content-Type': contentType };
    // 禁止缓存 data.json
    if (ext === '.json') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch (e) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

function getNextRefreshTime() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 9) return '今日 09:00';
  if (hour >= 21) return '明日 09:00';
  return '下一小时整点';
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  火山业务数据实时分析 Dashboard              │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │  地址: http://localhost:${PORT}                 │`);
  console.log('  │  数据: 自动刷新 (9:00-21:00 每小时)         │');
  console.log('  │  手动: POST /api/refresh 触发刷新           │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
});

process.on('SIGINT', () => { console.log('\n正在关闭...'); server.close(); process.exit(0); });
