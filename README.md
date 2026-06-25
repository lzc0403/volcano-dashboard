# 火山业务数据实时分析 Dashboard

自动从腾讯文档拉取数据，每小时刷新，GitHub Pages 部署。

## 架构

```
refresh-data.js      # 数据拉取 (API 直连 / mcporter CLI)
data.json            # 数据存储
index.html           # Dashboard 入口
app.js               # 前端渲染引擎 (Chart.js)
style.css            # 样式 (boc-scraper 配色)
.github/workflows/   # GitHub Actions 定时刷新
```

## 自动刷新

GitHub Actions 每天 9:00-21:00 (北京时间) 每小时自动拉取数据并部署。

## 本地运行

```bash
# 拉取数据 (需要 mcporter 已配置 tencent-docs)
node refresh-data.js

# 启动本地服务器
node server.js
# 访问 http://localhost:8080
```

## 部署地址

Dashboard: https://lzc0403.github.io/volcano-dashboard
