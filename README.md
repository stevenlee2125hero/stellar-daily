# Stellar AI

一个由 GitHub Pages 托管、GitHub Actions 每日自动更新的中文资讯阅读器。

## 自动化流程

- 每天北京时间 20:00（UTC 12:00）运行 `.github/workflows/deploy-pages.yml`。
- Actions 从公开 RSS 抓取前一日内容，更新 `public/data/content.json`。
- 更新器自动补齐启用自动化后的缺失日期，并保留最近 30 天连续归档。
- `npm run validate:content` 检查日期连续性、频道最低数量、必填字段和重复 ID。
- 校验和构建通过后，Actions 自动提交数据并发布到 GitHub Pages。
- 整条链路不使用 Cloudflare、Wrangler、D1 或 Codex 定时任务。

## 本地命令

```bash
npm ci
npm run dev
npm run update:content
npm test
```

`npm test` 会先验证数据完整性，再执行生产构建。
