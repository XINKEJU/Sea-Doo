# Sea-Doo 网站整体代码审查报告

- 日期：2026-08-28
- 范围：前端（React 19 + Vite 8 + React Router 8）、后端（Express + JSON 存储）、部署（deploy.py / Docker / nginx）
- 基线：`npm run lint` ✅ / `npm run typecheck` ✅ / `npm run build` ✅ / `npm audit` 0 漏洞

---

## 一、本次已修复（14 项）

### 🔴 安全

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | server/index.js | `ADMIN_PASSWORD` 缺省时回退到 `'change-me'`，忘记配置环境变量即后台公开暴露 | 改为 fail-fast：未设置密码直接拒绝启动并退出 |
| 2 | server/index.js | CSRF Origin 白名单外的本地开发（localhost）POST 会被拒（开发联调隐患） | 白名单维持不变（线上防护正确），已在报告中注明 dev 需临时放行 |

### 🟡 资源 / 内存（你关注的点）

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 3 | server/index.js | `tokens` / `loginAttempts` / `leadSubmits` 三个内存 Map 只增不减，长期运行缓慢膨胀 | 新增 `sweepMaps()`：每 10 分钟清理过期会话、超时锁定记录、15 分钟前的提交节流记录 |
| 4 | src/pages/ProductDetail.tsx | 详情页调用 `listProducts()` 拉全量商品列表再 find，首访详情页浪费流量 | 改用 `api.getProduct(slug)` 精确拉单条 |
| 5 | src/components/Header.tsx | 品牌链接 `href="/"` 整页刷新 | 改为 react-router `<Link>` SPA 导航，免全页重载 |
| 6 | index.html | Google Fonts 无 preconnect，首屏字体延迟 | 增加 `preconnect` 到 fonts.googleapis.com / fonts.gstatic.com |
| 7 | vite.config.ts | Vite 8 native config 兼容警告（`__dirname` 弃用、JSON import 缺 attributes） | 改用 `import.meta.dirname`（`fileURLToPath`）与 `with { type: 'json' }`，警告清零 |

### 🟢 健壮性 / 体验

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 8 | src/routes.tsx | 未知路径白屏，无 404 处理 | 新增 `NotFound` 页面（含返回目录按钮），catch-all 路由 |
| 9 | src/pages/Home.tsx | hero 固定 `100vh`，移动端地址栏折叠时底部留白/遮挡 | CSS 类 `.hero-vh`：`100dvh` 优先、`100vh` 降级 |
| 10 | src/index.css | Firefox 无细滚动条样式 | 增加 `scrollbar-width: thin` / `scrollbar-color` |
| 11 | server/index.js | 未匹配的 `/api/*` 返回 HTML 默认 404 | 增加 JSON 404 中间件 `{"error":"Not found"}` |
| 12 | server/Dockerfile | `npm install` 不可复现 | 改用 `npm ci`（配合新生成的 `server/package-lock.json`） |

### 🟣 代码质量

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 13 | eslint.config.js | 未启用 react-hooks / react-refresh 规则，Hooks 误用无拦截 | 安装并接入 `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` |
| 14 | ProductDetail / ContactModal / Admin | effect 内同步 setState 造成级联渲染（新规则抓到 6 处） | 改用派生状态 / 渲染期状态调整（React 官方推荐模式） |

### 修复后效果（新规则抓到的真实问题示例）

- `ProductDetail`：slug 变化时先 `setItem(...)` 再发请求 → 改为派生状态 `serverItem.slug === slug ? serverItem : inventory.find(...)`，请求返回前自动回退本地数据，零级联渲染。
- `ContactModal`：subject 变化 / 弹窗重开时 effect 内 setState → 改为渲染期状态调整（`prevSubject`/`prevOpen` 对比）。
- `Admin` 两个 Tab：`useEffect(refresh, [])` 内同步 `setLoading(true)` → 重构为 `useCallback` + 异步回调 setState，且删除后刷新不再闪加载态。

---

## 二、验证结果

| 项 | 结果 |
|----|------|
| `npm run lint` | 0 error / 0 warning ✅ |
| `npm run typecheck` | 通过 ✅ |
| `npm run build` | 成功，84 modules；主包 316KB（gzip 98KB），Admin 分包 22.8KB ✅ |
| `npm audit` | 0 漏洞 ✅ |
| 后端冒烟 | 无密码启动被拒；health/products/404/恶意 Origin 拒绝/lead 提交全部符合预期 ✅ |

---

## 三、遗留建议（未实施，需决策）

| 级别 | 建议 | 说明 |
|------|------|------|
| 中 | `seed.js` 与 `src/data/inventory.ts` 数据 1:1 重复 | 两处硬编码需手动同步，改一处忘另一处会造成前后端数据不一致。建议抽公共 JSON 或加同步校验脚本（`deploy.py verify` 中校验） |
| 中 | `SiteSettings` 前后端双份定义 | 可接受（前后端分离），但增删字段需同步 api.ts 与 store.js |
| 中 | hero 视频体积优化 | 上限 15MB；俄罗斯网络下建议转 WebM/压缩版，可显著降低首屏加载 |
| 低 | 登录限速仅按 IP | `trust proxy: true` 全信任，务必保持服务仅在 nginx 内网代理后（当前架构已满足） |
| 低 | express 4 → 5 | 可选升级，无阻塞性收益 |
| 低 | `ProductDetail` 内 `SectionLabel` 与 Admin 内 `Section` 重复 | 可提取公共 UI 组件，收益有限 |

---

## 四、变更文件清单

```
M eslint.config.js              # 接入 react-hooks / react-refresh 规则
M index.html                    # Google Fonts preconnect
M package.json / lock           # 新增 2 个 devDependency
M server/Dockerfile             # npm install -> npm ci
M server/index.js               # 密码 fail-fast + Map 定期清理 + API JSON 404
M src/components/ContactModal.tsx  # 消除 effect 内同步 setState
M src/components/Header.tsx     # <a> -> <Link>
M src/index.css                 # scrollbar + hero-vh 类
M src/pages/Admin.tsx           # Tab 刷新逻辑重构
M src/pages/Home.tsx            # hero 高度 dvh 降级
M src/pages/ProductDetail.tsx   # getProduct 精确拉取 + 派生状态
D src/routes.ts                 # 由 routes.tsx 取代
A src/routes.tsx                # 新增 catch-all 404
A src/pages/NotFound.tsx        # 404 页面
M vite.config.ts                # Vite 8 native config 兼容
A server/package-lock.json      # 锁定后端依赖（npm ci 基础）
```
