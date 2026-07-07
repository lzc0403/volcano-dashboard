# 火山业务数据实时分析 Dashboard

自动从腾讯文档拉取数据，每小时刷新，GitHub Pages 部署。

## 架构

```
refresh-data.js      # 数据拉取 (双文档: 7月原文档 + 6月副本文档)
data.json            # 数据存储 (months: { june, july } 结构)
index.html           # Dashboard 入口 (7 个编号 Section)
app.js               # 前端渲染引擎 (Chart.js)
style.css            # 样式 (dashboard-demo 风格, 主色 #2BAE85)
.github/workflows/   # GitHub Actions 定时刷新
server.js            # 本地预览服务器
```

## 数据源

| 文档 | file_id | 用途 |
|------|---------|------|
| 火山业务数据实时汇报表（原文档） | `DSVdETnBOaUp3ekRT` | 7 月数据（永不变） |
| 副本-火山业务数据实时汇报表 | `DYmh3d2pnWmZLbmJL` | 6 月历史数据 |

## 看板板块

| Section | 标题 | 内容 |
|---------|------|------|
| 01 | 每日消耗趋势 | 走势折线图（含 7 日均线）+ 项目占比饼图 |
| 02 | 项目消耗明细 | dash-table 含进度条和状态标签 |
| 03 | 多账户对比 | 深圳 / 贵州 / 阿里云账户卡片 |
| 04 | 数据质量与消耗特征 | 数据基础信息 + 大白话统计（每天平均花多少 / 花钱稳不稳定等） |
| 05 | 6 月 vs 7 月对比 | 对比卡 + 双月走势图 + 项目排名变化表 |
| 06 | 消耗集中度与周内规律 | Top10 进度条 + 集中度判定 + 星期柱状图 |
| 07 | 每日数据明细 | 逐日表格含环比 badge |

## 自动刷新

GitHub Actions cron `0 1-13 * * *`（UTC 1-13 点 = 北京时间 9-21 点每小时）自动拉取双月数据并部署。

## 本地运行

```bash
# 拉取数据 (需要 mcporter 已配置 tencent-docs)
node refresh-data.js

# 启动本地服务器 (端口 8130)
node server.js
# 访问 http://localhost:8130
```

## 部署地址

Dashboard: https://lzc0403.github.io/volcano-dashboard/

GitHub 仓库: https://github.com/lzc0403/volcano-dashboard
