#!/usr/bin/env node
/**
 * refresh-data.js
 * 从腾讯文档拉取火山业务数据，写入 data.json
 * 使用结构化单元格数据 (return_csv: false) 避免千分位逗号解析问题
 */
const fs = require('fs');
const path = require('path');

const FILE_ID_JULY = 'DSVdETnBOaUp3ekRT';   // 原文档 — 7月数据
const FILE_ID_JUNE = 'DYmh3d2pnWmZLbmJL';    // 副本文档 — 6月数据（历史归档）
const DATA_FILE = path.join(__dirname, 'data.json');
const API_BASE = 'https://docs.qq.com/openapi/mcp';
const TOKEN = process.env.TENCENT_DOCS_TOKEN || '';

async function mcpCall(method, params) {
  const resp = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: params || {} })
  });
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch (e) { console.error('API parse error:', text.substring(0, 300)); return null; }
}

async function callApi(tool, args) {
  if (TOKEN) {
    const result = await mcpCall('tools/call', { name: tool, arguments: args });
    if (result?.result?.content?.[0]) {
      try { return JSON.parse(result.result.content[0].text); }
      catch (e) { return result.result.content[0].text; }
    }
    return result?.result || null;
  }
  // 本地 mcporter 模式
  const { execSync } = require('child_process');
  const argsJson = JSON.stringify(args).replace(/"/g, '\\"');
  try { return JSON.parse(execSync(`mcporter call "tencent-docs" "${tool}" --args "${argsJson}"`, { encoding: 'utf8', timeout: 30000 })); }
  catch (e) { console.error(`[mcporter] ${tool} failed:`, e.message); return null; }
}

/**
 * 从结构化 cells 数据中提取表格
 * cells 格式: [{ row, col, value_type, string_value, number_value }, ...]
 */
function cellsToGrid(cells) {
  const grid = {};
  if (!cells || !Array.isArray(cells)) return grid;
  for (const cell of cells) {
    const r = cell.row;
    const c = cell.col;
    if (r == null || c == null) continue;
    if (!grid[r]) grid[r] = {};

    if (cell.value_type === 'STRING') {
      grid[r][c] = cell.string_value || '';
    } else if (cell.value_type === 'NUMBER') {
      grid[r][c] = cell.number_value;
    } else if (cell.value_type === 'BOOL') {
      grid[r][c] = cell.bool_value;
    } else {
      grid[r][c] = cell.string_value || cell.number_value || null;
    }
  }
  return grid;
}

/**
 * Excel 日期序列号 → 中文日期 (如 "6/1")
 * Excel base: 1899-12-30 (serial 1 = 1900-01-01)
 */
function excelDateToShort(serial) {
  if (!serial || typeof serial !== 'number' || serial < 40000) return null;
  // Use UTC consistently to avoid timezone offset between local (UTC+8) and GitHub Actions (UTC)
  // Excel epoch: Dec 30, 1899 (serial 1 = Dec 31, 1899 = Excel's "Jan 1, 1900" with Lotus bug)
  const base = Date.UTC(1899, 11, 30);
  const ms = base + serial * 86400000;
  const d = new Date(ms);
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}

function gridToArrays(grid, startRow, endRow, startCol, endCol) {
  const rows = [];
  for (let r = startRow; r <= endRow; r++) {
    const row = [];
    for (let c = startCol; c <= endCol; c++) {
      row.push(grid[r]?.[c] ?? null);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 从指定文档拉取一个 sheet 的数据，返回 { dates, projects }
 */
async function fetchSheet(fileId, sheet) {
  const maxRow = Math.min(sheet.row_count - 1, 60);
  const maxCol = (sheet.col_count || 26) - 1;
  console.log(`  拉取: ${sheet.sheet_name} (0-${maxRow}行, 0-${maxCol}列) from ${fileId.substring(0,8)}...`);

  const data = await callApi('sheet.get_cell_data', {
    file_id: fileId, sheet_id: sheet.sheet_id,
    start_row: 0, end_row: maxRow, start_col: 0, end_col: maxCol,
    return_csv: false
  });

  if (!data) { console.warn(`  ${sheet.sheet_name} 拉取失败`); return null; }

  let rows;
  if (data.cells && Array.isArray(data.cells) && data.cells.length > 0) {
    const grid = cellsToGrid(data.cells);
    rows = gridToArrays(grid, 0, maxRow, 0, maxCol);
  } else if (data.csv_data) {
    rows = parseCsvQuoted(data.csv_data);
  } else {
    console.warn(`  ${sheet.sheet_name} 无数据`);
    return null;
  }

  if (rows.length < 3) { console.warn(`  ${sheet.sheet_name} 行数不足`); return null; }

  // 第0行: 日期标题
  const headerRow = rows[0];
  const dates = [];
  for (let j = 1; j < headerRow.length; j++) {
    const raw = headerRow[j];
    if (raw === null || raw === undefined || raw === '') continue;
    const shortDate = excelDateToShort(raw);
    if (shortDate) { dates.push(shortDate); continue; }
    const s = String(raw).trim();
    if (s) dates.push(s);
  }

  const projects = {};
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || !String(row[0]).trim()) continue;
    const name = String(row[0]).trim();
    if (name === '合计' || name === '') continue;

    const values = [];
    for (let j = 0; j < dates.length; j++) {
      const raw = row[j + 1];
      if (raw === null || raw === undefined || raw === '') { values.push(null); continue; }
      const v = parseFloat(String(raw).replace(/,/g, ''));
      values.push(isNaN(v) ? null : v);
    }
    projects[name] = values;
  }

  // 计算合计
  const totals = new Array(dates.length).fill(0);
  for (const vals of Object.values(projects)) {
    vals.forEach((v, i) => { if (v !== null) totals[i] += v; });
  }
  projects['合计'] = totals;

  console.log(`  完成: ${sheet.sheet_name}, ${Object.keys(projects).length - 1} 项目, ${dates.length} 天`);
  return { sheet_id: sheet.sheet_id, dates, projects };
}

async function main() {
  console.log(`[${new Date().toISOString()}] 开始拉取腾讯文档数据...`);
  console.log(`  模式: ${TOKEN ? 'API 直连' : 'mcporter CLI'}`);

  if (TOKEN) {
    console.log('  初始化 MCP...');
    const init = await mcpCall('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'volcano-dashboard', version: '1.0.0' }
    });
    if (!init) { console.error('MCP 初始化失败'); process.exit(1); }
    console.log('  MCP 就绪');
  }

  // === 7月数据（原文档）===
  console.log('\n--- 拉取7月数据 (原文档) ---');
  const julyInfo = await callApi('sheet.get_sheet_info', { file_id: FILE_ID_JULY });
  if (!julyInfo?.sheets) { console.error('获取7月子表失败'); process.exit(1); }

  const julyAccounts = {};
  for (const sheet of julyInfo.sheets) {
    const result = await fetchSheet(FILE_ID_JULY, sheet);
    if (result) julyAccounts[sheet.sheet_name] = result;
  }

  // === 6月数据（副本文档）===
  console.log('\n--- 拉取6月数据 (副本文档) ---');
  const juneInfo = await callApi('sheet.get_sheet_info', { file_id: FILE_ID_JUNE });
  const juneAccounts = {};
  if (juneInfo?.sheets) {
    for (const sheet of juneInfo.sheets) {
      const result = await fetchSheet(FILE_ID_JUNE, sheet);
      if (result) juneAccounts[sheet.sheet_name] = result;
    }
  } else {
    console.warn('副本文档不可用，跳过6月数据');
  }

  const result = {
    timestamp: new Date().toISOString(),
    file_id_july: FILE_ID_JULY,
    file_id_june: FILE_ID_JUNE,
    months: {
      july: { label: '2026年7月', accounts: julyAccounts },
      june: { label: '2026年6月', accounts: juneAccounts }
    },
    // 兼容旧版前端：默认用7月数据作为 accounts
    accounts: julyAccounts
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[${new Date().toISOString()}] 数据已写入 data.json (6月+7月)`);
}

/**
 * 正确解析带引号字段的 CSV (处理 "21,751.25" 这类千分位数字)
 */
function parseCsvQuoted(csvData) {
  if (!csvData) return [];
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvData.length; i++) {
    const ch = csvData[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csvData[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        current.push(field); field = '';
        if (current.length > 0 && !(current.length === 1 && current[0] === '')) rows.push(current);
        current = [];
        if (ch === '\r' && csvData[i + 1] === '\n') i++;
      } else { field += ch; }
    }
  }
  if (field || current.length) { current.push(field); rows.push(current); }
  return rows;
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
