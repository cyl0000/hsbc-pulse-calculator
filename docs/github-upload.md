# 更新 GitHub 仓库

本项目的公开仓库是 [`cyl0000/hsbc-pulse-calculator`](https://github.com/cyl0000/hsbc-pulse-calculator)。日常开发使用 `codex/develop` 分支，`main` 用于稳定版本。

## 上传前检查

在项目根目录运行：

```bash
git status --short --branch
git ls-files
npm test
npm run build
```

确认真实结单所在的 `我的账单/`、`*.pdf`、导出的 `*.csv`、密钥、`node_modules/`、`dist/` 和 `.env*` 均未出现在 Git 跟踪列表。测试只使用虚构数据。

## 后续更新

首次克隆新仓库后，在本地使用 `codex/develop` 开发并推送：

```bash
git clone https://github.com/cyl0000/hsbc-pulse-calculator.git
cd hsbc-pulse-calculator
git switch codex/develop
# 修改、验证并提交后
git push origin codex/develop
```

GitHub 不接受账号密码进行 Git 推送。可以使用 GitHub CLI 网页授权、SSH 密钥或个人访问令牌。不要把令牌写入代码、脚本或命令行 URL。

确认开发分支无误后，再由维护者决定是否创建 PR 合并到 `main`。上传源码不会自动更新线上网页；部署时运行 `npm ci`、`npm test`、`npm run build`，发布完整 `dist/` 目录，并使用 HTTPS。
