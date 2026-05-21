# web-ds

GitHub Pages + Supabase 版本的体检报告优化工具。

## Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`。
3. 在 Authentication 中启用 Email 登录。
4. 在 Authentication URL Configuration 中加入 GitHub Pages 地址：

```text
https://F1yingWhite.github.io/web-ds/
```

## GitHub Pages

在 GitHub 仓库中添加 Actions secrets：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

然后到 Settings -> Pages，将 Source 设置为 GitHub Actions。

推送到 `main` 后，`.github/workflows/deploy.yml` 会自动构建并发布 `dist/`。

## 本地运行

```bash
cp .env.example .env
npm install
npm run dev
```

## 说明

Supabase 只保存每个用户自己的配置：

- DeepSeek API Key
- API Base URL
- 模型
- 提示词

体检报告输入和模型输出不会写入数据库。
