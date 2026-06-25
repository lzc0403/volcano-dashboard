#!/usr/bin/env node
/**
 * refresh-data.js
 * 从腾讯文档拉取火山业务数据，写入 data.json
 * 支持两种模式:
 *   - 本地: 使用 mcporter CLI
 *   - GitHub Actions: 直接调用 API (TENCENT_DOCS_TOKEN 环境变量)
 */
const fs = require('fs');
const path = require('path');

const FILE_ID = 'DYmh3d2pnWmZLbmJL';
const DATA_FILE = path.join(__dirname, 'data.json');
const API_BASE = 'https://docs.qq.com/openapi/mcp';
const TOKEN = process.env.TENCENT_DOCS_TOKEN || '';

async function mcpCall(method, params) {
  const resp = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': TOKEN
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params || {}
    })
  });
  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    return json;
  } catch (e) {
    console.error('API response parse error:', text.substring(0, 300));
    return null;
  }
}

async function callApi(tool, args) {
  // GitHub Actions: 直接调用 MCP API (JSON-RPC 2.0)
  if (TOKEN) {
    const result = await mcpCall('tools/call', {
      name: tool,
      arguments: args
    });
    if (result && result.result && result.result.content && result.result.content[0]) {
      try {
        return JSON.parse(result.result.content[0].text);
      } catch (e) {
        return result.result.content[0].text;
      }
    }
    return result ? result.result : null;
  }

  // 本地: 使用 mcporter
  const { execSync } = require('child_process');
  const argsJson = JSON.stringify(args).replace(/"/g, '\\"');
  const cmd = `mcporter call "tencent-docs" "${tool}" --args "${argsJson}"`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(out);
  } catch (e) {
    console.error(`[mcporter] ${tool} failed:`, e.message);
    return null;
  }
}

function parseCsv(csvData) {
  if (!csvData) return [];
  return csvData.split('\n').map(row => row.split(','));
}

async function main() {
  console.log(`[${new Date().toISOString()}] 开始拉取腾讯文档数据...`);
  console.log(`  模式: ${TOKEN ? 'API 直连' : 'mcporter CLI'}`);

  // MCP 初始化握手
  if (TOKEN) {
    console.log('  初始化 MCP 连接...');
    const initResult = await mcpCall('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'volcano-dashboard', version: '1.0.0' }
    });
    if (!initResult) {
      console.error('MCP 初始化失败');
      process.exit(1);
    }
    console.log('  MCP 连接成功');
  }

  // 1. 获取子表信息
  const sheetsInfo = await callApi('sheet.get_sheet_info', { file_id: FILE_ID });
  if (!sheetsInfo || !sheetsInfo.sheets) {
    console.error('获取子表信息失败:', JSON.stringify(sheetsInfo));
    process.exit(1);
  }

  const result = {
    timestamp: new Date().toISOString(),
    file_id: FILE_ID,
    accounts: {}
  };

  // 2. 遍历每个子表拉取数据
  for (const sheet of sheetsInfo.sheets) {
    console.log(`  拉取子表: ${sheet.sheet_name} (${sheet.sheet_id}), ${sheet.row_count}行 x ${sheet.col_count}列`);

    const data = await callApi('sheet.get_cell_data', {
      file_id: FILE_ID,
      sheet_id: sheet.sheet_id,
      start_row: 0,
      end_row: sheet.row_count - 1,
      start_col: 0,
      end_col: (sheet.col_count || 26) - 1,
      return_csv: true
    });

    if (!data || !data.csv_data) {
      console.warn(`  子表 ${sheet.sheet_name} 拉取失败，跳过`);
      continue;
    }

    const rows = parseCsv(data.csv_data);
    if (rows.length < 2) {
      console.warn(`  子表 ${sheet.sheet_name} 数据不足，跳过`);
      continue;
    }

    // 第一行: 日期标题, 第二行: 消耗数量, 第三行起: 项目数据
    const headerRow = rows[0];
    const dates = headerRow.slice(1).filter(d => d && d.trim());

    const projects = {};
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0] || !row[0].trim()) continue;
      const name = row[0].trim();
      if (name === '合计' || name === '') continue;

      const values = [];
      for (let j = 1; j <= dates.length; j++) {
        const v = row[j] ? parseFloat(row[j].trim()) : null;
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

    result.accounts[sheet.sheet_name] = {
      sheet_id: sheet.sheet_id,
      dates: dates,
      projects: projects
    };

    console.log(`  完成: ${sheet.sheet_name}, ${Object.keys(projects).length - 1} 个项目, ${dates.length} 天`);
  }

  // 3. 写入 data.json
  fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[${new Date().toISOString()}] 数据已写入 data.json`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
