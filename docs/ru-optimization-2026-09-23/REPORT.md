# 面向俄罗斯用户的工程优化报告

- 日期：2026-09-23
- 站点：`https://seadoo.aaatslydaaa.ru`（品牌 DY_RIDE，Челябинск）
- 目标：消除对外部（Google）资源的依赖、修复首屏错误品牌闪现、降低弱网首屏成本、
  补齐面向 Яндекс 的 SEO 元数据与网关缓存策略。
- 部署方式：`deploy.py front` + `deploy.py conf`，经 CONNECT 代理隧道（`SSH_PROXY`）。

---

## 1. 结论速览

| 项 | 优化前 | 优化后 | 证据 |
|---|---|---|---|
| 字体来源 | Google Fonts 外链 | 同源 `/fonts/`（4 个子集，178KB） | `requestedGoogle: []`、`requestedExternal: []` |
| 首屏品牌 | 闪 `SEA-DOO PREMIUM USED / © 2025` | 骨架屏，无任何兜底假数据 | 慢接口下 `earlyText.sample === ""` |
| 弱网 Hero（3G） | 拉 1600px 海报 254KB | 拉 828px 海报 83KB（**降 67%**） | `posterRequests: [.../hero-poster-828.jpg]`、`srcset: null` |
| Hero 视频（3G/省流） | 无条件自动播放 11.7MB mp4 | 完全不发请求，改用海报 | `mp4Requests: []` |
| 设置接口请求数 | 每次路由切换重复请求 | SPA 内去重为 1 | `settingsRequests: 1`（含两次路由切换） |
| 详情页取数 | 拉全量列表 4.8KB | 单商品 0.93KB | `detailApiCalls: [.../api/products/:slug]` |
| HTML 缓存 | 无策略（可能缓存导致发版不生效） | `no-cache`（每次回源，ETag 协商） | 响应头 `Cache-Control: no-cache` |
| API 缓存 | 无 ETag 协商 | `no-cache` + ETag，可 304 | 带 `If-None-Match` 复验 **304 / 0 字节** |
| 静态资源 | 无长缓存 | `max-age=31536000, immutable` | 字体/哈希资源响应头 |
| SEO | 无 canonical/OG/sitemap | 标题+OG+JSON-LD+sitemap+robots | 线上 HTML 与 `/sitemap.xml`（19 条 URL） |
| CSP | 含 Google 字体域 | `font-src 'self'` | 响应头 CSP |
| 移动端适配 | — | 6 档视口 0 缺陷 | `mobile-audit` 全通过 |

---

## 2. 逐项改动

### 2.1 字体自托管（去 Google 依赖）

Google 域名在俄罗斯可达性不稳定，外链字体在受限网络下会把首屏长时间卡在回退字体上。

- 新增 `public/fonts/inter-v20-{cyrillic-ext,cyrillic,latin-ext,latin}.woff2`（合计 178KB）。
- `src/index.css` 用 4 段 `@font-face` + `unicode-range` 分片，`font-display: swap`；
  未用到的子集不发请求。
- `index.html` 移除 Google 的 `preconnect` 与外链样式表，改为预加载 `cyrillic` 与 `latin`
  两个「俄文页面必定用到」的子集。
- CSP 收紧为 `font-src 'self'`。

> 注意：字体文件名含版本号（`v20`）。升级 Inter 时必须同步改 `index.css`、`index.html`
> 与 `public/fonts/` 下的文件名，否则命中不到。

实测：`requestedFonts` 全部为同源 `/fonts/`；`requestedGoogle: []`；`requestedExternal: []`；
`document.fonts.check('16px Inter')` 为真（字体真正就绪，而非仅声明）。

### 2.2 修复首屏错误品牌闪现（核心缺陷）

**根因**：`Home.tsx` 以 `useState(DEFAULT_SETTINGS)` 同步初始化，接口返回前就用本地兜底数据
渲染了一屏，于是出现并非线上品牌的 `SEA-DOO PREMIUM USED / © 2025 / 4 доступно`。

**修复**：
1. 新增全局数据层 `src/store.ts`——`useSyncExternalStore` + 模块级缓存 + TTL +
   并发去重（`inflight` promise）+ `sessionStorage` 水合。
2. `DEFAULT_SETTINGS` 清空所有品牌字段，并在注释中明确「禁止当作真实值渲染」。
3. 数据未就绪时渲染 `HomeSkeleton`，**不渲染任何兜底假数据**；失败时才给 `LoadError` 重试入口。
4. 删除 `src/data/inventory.ts`（含硬编码 SEA-DOO 示例商品，重构后已无引用），
   `JetSki` 类型抽到 `src/types.ts`。

实测（线上）：慢接口下 `earlyText.sample === ""`（该窗口期屏幕上没有任何品牌文案）。

> 关于 `hasSeaDoo: true`：已逐节点核查，线上 6 处 `Sea-Doo` 全部位于
> `div.card-grid` 内、是**在售商品型号**（如 `Sea-Doo GTR 230 2023`），
> 页头/首屏/页脚均无 SEA-DOO 品牌。属正常业务内容，非缺陷。

### 2.3 弱网 Hero 降级

分两层，共用同一套网络信号（`isWeakNetwork()`），避免出现
「不加载视频却仍拉 254KB 大图」这类自相矛盾的结果：

1. **视频层**：`saveData` 或 `prefers-reduced-motion` 或 `effectiveType ∈ {slow-2g,2g,3g}`
   → 不渲染 `<video>`，完全不发起 11.7MB 的 mp4 请求。
2. **海报层**：弱网下锁定 828px 版本（83KB）并**不下发 `srcset`**。
   原因：`srcset` 的选片只由「视口宽 × DPR」决定、与网速无关——375px 的 DPR3 手机会算出
   需要 1125px，从而挑中 1600px(254KB) 的大图。实测线上弱网下确实如此，属真实缺陷。

实测（线上）：

| 条件 | `effectiveType` | `<video>` | mp4 请求 | 海报 |
|---|---|---|---|---|
| Slow 3G | `3g` | 无 | 0 | `/hero-poster-828.jpg`（srcset 为空） |
| 强制 4G | `4g` | 有，`paused: false`、`readyState: 4` | 1 | 828（窄屏），srcset 恢复 |

> 说明：线上「好网」分支无法经代理隧道自然触发——Chrome 的网络质量估计器依据**实测**
> 吞吐/延迟判定，而代理隧道本身较慢，`effectiveType` 被如实降级为 `3g`。
> 因此改用 `Page.addScriptToEvaluateOnNewDocument` 在应用脚本前覆写
> `navigator.connection`，以验证线上代码的视频分支。这同时反证了降级逻辑
> 确实跟随真实网络质量，而非固定值。

### 2.4 SEO（面向 Яндекс）

- `.figma/make/site.json`：俄文标题/描述 + `siteUrl` + `openGraph`（含 `locale: ru_RU`）。
- 构建期注入 `og:*`、`twitter:*`、`og:site_name`、`og:locale`、`og:type`、`og:url`
  与 `AutoDealer` JSON-LD（转义 `<`）。
- 新增 `src/seo.ts` 的 `useSeo()`：SPA 逐路由在运行时更新 `document.title`、canonical、
  `og:url/title/description/image`；`/admin`、404 等页面加 `noindex`。
- canonical 刻意**不**在构建期注入，交由运行时写入，避免同域名下路由间互相覆盖。
- 构建期生成 `sitemap.xml`（构建时拉 `/api/products`，超时 8s 则退化为仅首页）。
  线上实际产出 19 条 URL，与库存一致。
- `public/robots.txt`：`Allow: /` + `Disallow: /admin` + Sitemap 声明。

### 2.5 网关缓存策略

nginx `add_header` **不会继承**：凡是在 location 内自行 `add_header` 的地方，
父级的安全头会被丢弃。`deploy.py` 因此用 `_security_headers(indent)` 生成
`@@SEC4@@ / @@SEC8@@` 占位符，在每个需要的位置重复注入。

| 目标 | 策略 | 理由 |
|---|---|---|
| HTML | `no-cache` | 发版即时生效，不出现「已部署但用户看到旧页」 |
| 公开 API | `no-cache` + ETag | 允许 304 协商，省流量又不牺牲新鲜度 |
| 管理 API | `no-store` | 后台数据不得落盘 |
| 哈希资源 | `public, max-age=31536000, immutable` | 文件名带内容哈希 |
| 上传文件 | `public, max-age=2592000, immutable` | 30 天 |

同时修正：`deploy.py` 中的 `SEADOO_CONF` 常量此前描述的是「双域名 seatoys + SAN 证书」，
与服务器实际（单域名 + `seadoo.aaastlydaaa.ru`）不符——直接执行 `deploy.py conf`
会因引用不存在的证书而 `nginx -t` 失败并回滚。已改为与服务器现状一致。

---

## 3. 线上回归验证

### 3.1 HTTP / 缓存 / 重定向（服务器侧）

```
/                                    -> 200
/inventory/sea-doo-gti-130-2025      -> 200
/admin                               -> 200
/api/health                          -> 200
/sitemap.xml                         -> 200
/robots.txt                          -> 200
/fonts/inter-v20-cyrillic.woff2      -> 200

HTML   Cache-Control: no-cache
font   Cache-Control: public, max-age=31536000, immutable
api    ETag: W/"340-..."  +  Cache-Control: no-cache
外部字体 CDN 引用计数: 0
HTTP -> HTTPS: / /admin /api/health 均 301
证书 SAN: DNS:seadoo.aaatslydaaa.ru（有效期至 2026-11-26）
```

ETag 协商复验：带 `If-None-Match` 请求 `/api/settings` → **304 / 0 字节**；
同一 ETag 请求 `/`（HTML）→ **200 / 4595 字节**（符合 `no-cache` 语义，不会误返回 304）。

### 3.2 移动端适配（6 档视口 × 3 页面 + 弹窗）

```
全部通过：无横向溢出，无 <12px 字号，无 <44px 触控目标
（320x568 / 360x740 / 375x812 / 390x844 / 414x896 / 768x1024）
```

### 3.3 已知非缺陷项

- **`aaast` 拼写域名**：`seadoo.aaastlydaaa.ru` 在 nic.ru **无 DNS 记录**
  （查询返回 `REFUSED`），故 `curl` 得到 `000`。该 nginx 301 规则本身正确
  ——用 `Host` 头直连 `127.0.0.1` 验证得 `301 -> https://seadoo.aaatslydaaa.ru/`。
  属安全网，等该记录存在时才生效。验证脚本已改为用 Host 头断言，避免被误读为失败。
- **商品描述重复年份**：后端数据中存在「2023 2023 года」这类重复，属录入问题。
  已在 SEO 标题生成处用幂等的 `modelLabel`（型号已含 4 位年份则不再拼接）规避，
  未改动后端数据。

---

## 4. 后续建议

1. 清理库存描述中重复的年份（数据侧，非代码）。
2. 若希望「好网 + 高 DPR 手机」也少下 254KB，可再生成 ~1100px 的海报中间档。
3. `seatoys.aaatslydaaa.ru` 域名自迁移以来从未真正启用；若不再需要，
   建议在 nic.ru 下掉解析，避免与 `seadoo.` 混淆。
