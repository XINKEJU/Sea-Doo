# 移动端适配诊断与修复报告

日期：2026-09-23
范围：`index.html`、`src/index.css`、`src/components/*`、`src/pages/*`
验证：真实 Chromium 内核 + CDP，6 档视口 × 4 个页面 + 弹窗 + 后台列表行契约

---

## 一、诊断结论

原实现存在 **7 类**移动端缺陷，其中 1 类为「页面级布局错乱」，1 类为「隐蔽的性能/呈现缺陷」。

### P0-1 商品网格在窄屏被裁切（最严重）

`Home.tsx` 商品网格与骨架屏使用 `gridTemplateColumns: repeat(auto-fill, minmax(380px, 1fr))`。
`minmax()` 的下界是**硬下界**：375px 视口下容器内容宽度仅 295px（375 − 40×2 内距），
轨道被强制为 380px，超出容器 85px。由于 `body` 设有 `overflow-x: hidden`，
溢出不会产生滚动条，而是**直接把卡片右侧裁掉**——价格与「Л.С.」全被切出屏幕。

### P0-2 详情页固定双列溢出

`ProductDetail.tsx` 内容区 `gridTemplateColumns: "1fr 420px"`。窄屏下第二列固定 420px，
第一列被压到接近 0，整块溢出（同样被 `overflow-x: hidden` 掩盖成裁切）。

### P0-3 Google Fonts 的 `@import` 阻塞整张样式表

`src/index.css` 首行 `@import url('https://fonts.googleapis.com/...')`。
CSS 规范要求 `@import` 位于最前，其加载完成前**整张样式表不生效**。
在 Google 服务受限/缓慢的网络下（本站目标市场为俄罗斯），页面会长时间处于无样式状态，
观感上等同于「布局完全错乱」。

> 该缺陷在本次验证中被实测捕获：首轮审计中有测量结果的 `text-size-adjust` 呈现
> `auto`（未应用样式）与 `100%`（已应用）两种取值。

### P1-1 字号过小

全站散布 9 / 10 / 11px 字号：商品徽章 9px、区块小标签 10px、按钮文字 11px、规格标签 10px。
在 375–430px 的手机屏幕上远低于可读下限（12px）。

### P1-2 iOS 输入框聚焦自动放大

联系弹窗输入框 15px、后台输入框 14px。iOS Safari 对 `font-size < 16px` 的输入框
聚焦时会自动放大整个页面，用户点一下输入框页面就「错乱」。

### P1-3 触控区域不足

按 WCAG 2.5.8 / Apple HIG 的 44×44px 下限，以下元素不达标：

| 元素 | 实测尺寸 |
|---|---|
| Header 品牌 Logo 链接 | 123 × 26 |
| Header「СВЯЗАТЬСЯ」按钮 | ≈ 33px 高 |
| 详情页「← ВСЕ МОДЕЛИ」 | padding 为 0，仅文字高度 |
| 后台登录「ВОЙТИ」 | 35px 高 |
| 后台图片操作按钮 ★ / ✕ | 26 × 26 |
| 弹窗关闭按钮 ✕ | ≈ 28 × 28 |

### P1-4 hover-only 交互在触屏不可见

商品卡的「СМОТРЕТЬ →」入口由 `opacity: hovered ? 1 : 0` 控制。
触屏设备不触发 hover，用户**永远看不到卡片可点击的提示**。
图片的 `scale(1.04)` 缩放同理，触屏点击后会卡在放大态（sticky hover）。

### P2-1 缺少响应式断点与安全区

全站零媒体查询（仅一处 `@supports`），尺寸全为固定 px：页面内距 40px、区块纵向留白
96/120px、规格栏 420px、详情主图 16/7、缩略图 120×80。视口 meta 缺 `viewport-fit=cover`，
未处理刘海与主屏指示条安全区。`html` 无 `text-size-adjust: 100%`。

### P2-2 弹窗的键盘遮挡与滚动锁定

弹窗无 `max-height` / 内部滚动，软键盘弹出后提交按钮被遮挡；
`document.body.style.overflow = "hidden"` 在 iOS Safari 上**不能**阻止背景滚动（必须用 fixed 定位锁定）。

### P2-3 图片像素严重冗余

图片均来自后台录入的外链，未做分辨率适配。实测：

| 位置 | 原始宽度 | 展示宽度 | 冗余倍数 |
|---|---|---|---|
| 首页 Hero | 2400px | 375px | 2.13× |
| 详情页缩略图 | 1200px | 92px | 4.35× |

---

## 二、修复方案

沿用项目既有约定：**组件视觉仍以内联 `style` 表达**。响应式能力通过三层实现，
避免引入 Tailwind 式原子类体系：

1. **文档层**（`index.html`）
   `viewport` 增加 `viewport-fit=cover` 与 `interactive-widget=resizes-content`；
   新增 `theme-color` / `color-scheme` / `format-detection`；
   字体改为 `<link rel="stylesheet">` 加载（解除对样式表的阻塞）；
   `.figma/make/site.json` 补 `language: "ru"`（原为默认 `en`，影响断行与字体回退）。

2. **令牌层**（`src/index.css` 的 `:root` + 三档媒体查询）
   定义 `--page-x`、`--card-min`、`--detail-aside`、`--hero-h`、`--fs-*`、`--touch` 等语义令牌，
   在 `1024 / 768 / 380` 三个断点覆盖。组件仍写内联样式，值取自 `var(--x)`，
   **全站媒体查询只集中在 `index.css` 一处**。

3. **布局原语层**（同文件的语义类，非原子类）
   仅承载内联样式无法表达的**结构性**响应式行为：
   `.site-header` / `.site-header__inner` / `.safe-bottom`（安全区）、
   `.row-split`（两端对齐行 → 窄屏纵向堆叠）、
   `.card-grid`、`.card-cta` / `.card-media`（触屏常显、仅精确指针设备走 hover）、
   `.detail-split` / `.detail-aside` / `.detail-price`（双列 → 单列、取消 sticky）、
   `.modal-overlay` / `.modal-sheet` / `.modal-close`、
   `.admin-item` / `.admin-item__actions` / `.admin-thumb` / `.field-row`、
   `.btn-touch` / `.brand-link`（触控目标补足，仅触屏或窄屏生效，不改桌面视觉）。

关键实现要点：

- 网格轨道下界改用 `min(var(--card-min), 100%)`——**从根本上保证单列不溢出**，而非依赖裁切。
- `card-cta` 的过渡与位移整体交给 CSS，默认（触屏）常显，仅在
  `@media (hover: hover) and (pointer: fixed)` 下启用 hover 显隐。
- 输入框字号由 `--fs-input` 控制：桌面 14px，窄屏 16px，正好越过 iOS 自动缩放的阈值。
- 弹窗滚动锁定改为「窄屏/触屏下 `body` 固定定位 + 负向偏移当前滚动量」，
  关闭时临时关闭 `scroll-behavior: smooth` 再恢复滚动位置。

---

## 三、验证结果

在真实 Chromium 内核下以 6 档视口实测（`audit.mjs`，零依赖，通过 CDP 驱动）。
**验证时主动屏蔽 `fonts.googleapis.com` / `fonts.gstatic.com`**，以还原外部字体不可用的现实网络；
并在测量前等待样式表确认生效（`--page-x` 可读）后才取值。

视口：320×568 / 360×740 / 375×812 / 390×844 / 414×896 / 768×1024

| 检查项 | 修复前 | 修复后 |
|---|---|---|
| 横向溢出（`scrollWidth − innerWidth`） | 最大 +85px | **全部 0** |
| 小于 12px 的文字 | 每页 2–3 类 | **全部 0** |
| 小于 44px 的触控目标 | 每页 1–2 个 | **全部 0** |
| 弹窗输入框最小字号 | 15px（触发 iOS 缩放） | **16px** |
| 弹窗在 320px 下 | 无滚动、提交按钮被遮挡 | 贴底、限高 88dvh、内部可滚动 |
| 弹窗关闭按钮 | ≈28×28 | **44×44** |
| 弹窗提交按钮 | 内容宽 | **满宽 × 51px** |
| 弹窗打开时背景滚动 | 未锁定（iOS） | **已锁定** |
| 后台列表行（合成 DOM 契约） | — | 缩略图 72×54、操作区整行独占、按钮 48px 高、零溢出 |

截图存于 `screenshots/`（体积原因未纳入版本控制，可用本目录 `audit.mjs` 重新生成）。

---

## 四、部署状态

**未完成部署**。`deploy/deploy.py front` 连续 5 次连接超时；
经排查，本机对 `170.168.89.127` 的 **22 与 443 端口均不可达**
（`example.com`、`api.github.com` 均返回 200，排除外网整体中断），
`https://seatoys.aaatslydaaa.ru` 亦返回 000。属目标主机不可达，非认证或配置问题。

修复已构建完成，`dist/` 为最新产物。网络恢复后执行：

```bash
SSH_KEY="$HOME/.ssh/id_ed25519" python deploy/deploy.py front
```

（前端部署仅上传 `dist/`，不重建容器、不触碰 nginx 配置。）

---

## 五、遗留与后续建议

1. **图片分辨率冗余**（P2-3）未处理。图片来源为后台录入的外链（Unsplash 或上传文件），
   前端无法生成多尺寸变体。建议二选一：
   - 上传侧生成 480 / 960 / 1600 三档并输出 `srcset`（效果最好）；
   - 或在 nginx 引入 `image_filter`，按查询参数实时缩放。
   当前已为折叠线以下的图片补 `loading="lazy"` + `decoding="async"`。

2. **后台已登录列表页未做端到端实测**。后台需密码认证，本次以「合成 DOM 契约」验证
   `.admin-item` 系列样式规则的实际计算结果（`display: flex`、`flex-wrap: wrap`、
   缩略图 72×54、操作区整行独占、按钮 48px、零溢出）。建议用真实账号在手机上复核一次。

3. **弹窗遮罩的 `backdrop-filter: blur(8px)`** 为全屏模糊，在低端安卓上有掉帧风险。
   本次保留以维持设计语言；若后续收到卡顿反馈，可降级为半透明纯色。

4. **静态壳的标题与线上品牌不一致**。线上 `GET /api/settings` 的 `brandName` 为 **`DY_RIDE`**
   （副标 `Гидроциклы • Мотовездеходы • Трициклы`，`Челябинск и регионы`），而 `index.html` /
   `.figma/make/site.json` 的 `<title>` 仍是 "Sea-Doo Premium Jet Skis | Luxury Used Inventory"。
   该标题由 `vite.config.ts` 读取 `site.json` 注入，改一处即可生效 —— 待确认后处理。

---

## 部署上线（2026-09-23 01:2x 完成）

**状态：已上线并通过线上实测。** 生产域名：`https://seadoo.aaatslydaaa.ru`

### 部署障碍与解决

| 阶段 | 现象 | 结论 |
|---|---|---|
| 原网络（中国移动出口） | 服务器 22/80/443 全超时、ICMP 100% 丢包 | — |
| 更换网络后（中国联通 AS4837） | **仍然全不通** | 非单一 ISP 问题 |
| check-host 境外节点探测 | 欧洲/印度/摩尔多瓦节点 443 均 **65–210ms 连通** | **服务器在线**，是本机出境链路被阻断 |
| 本机 Clash（`127.0.0.1:7897`，global 模式） | 用 **IP** 访问 `170.168.89.127` → 301/200；用**域名** → 一律 000 | 根因是**代理侧 DNS（fake-ip）不可用**，不是节点不可达 |

解决方式：为 `deploy/deploy.py` 增加 `SSH_PROXY` 支持，经 HTTP 代理以 `CONNECT` 隧道直连
服务器 IP，并把 socket 交给 paramiko。两个必须遵守的细节：

1. CONNECT 目标**必须写 IP** —— 传域名会被代理 DNS 解析成 fake-ip，直接连不通。
2. 读取 CONNECT 响应头必须**逐字节** —— 一次 `recv` 会顺带吞掉紧随其后的 SSH banner，
   导致 paramiko 等待 banner 而挂死。

```bash
SSH_KEY="$HOME/.ssh/id_ed25519" SSH_PROXY="http://127.0.0.1:7897" \
  python deploy/deploy.py front
```

### 线上验证结果

线上 HTML 已引用新产物 `index-dN4tjd5h.js` / `index-BUIaN5S9.css`，CSS 内含 `--page-x` 响应式令牌，
viewport 为 `viewport-fit=cover, interactive-widget=resizes-content`。

经代理用真实 Chrome 对**线上生产站点**复测 6 档视口：

| 视口 | 横向溢出 | <12px 字号 | <44px 触控目标 |
|---|---|---|---|
| 320×568 / 360×740 / 375×812 / 390×844 / 414×896 / 768×1024 | **全部 0** | **全部 0** | **全部 0** |

弹窗（移动端底部抽屉）：全部视口**贴底、限高、在视口内**；输入字号 16px、关闭按钮 44×44、
提交按钮满宽 51px 高、背景滚动已锁定。

证据：`live-report.json`、`live-report-pages.json`。截图在 `live-screenshots/`（页面 + 弹窗，
含 320–768 六档；体积原因未纳入版本控制，可用 `audit.mjs --shots always` 重新生成）。

### 视觉复核时发现的**新缺陷**：首屏闪现错误品牌与演示数据

复核线上截图时发现：**320×568 的首张截图显示的是「SEA-DOO PREMIUM USED」＋ 摩托艇演示数据
＋「4 доступно」**，而 375×812 显示正确的「DY_RIDE」＋「18 доступно」。可稳定复现（同一轮中
始终是**首个视口**出错，后续视口正常）。

**成因**（已定位到代码）：

```tsx
// src/pages/Home.tsx
const [items, setItems] = useState<JetSki[]>(inventory);              // 内置 6 条 SEA-DOO 演示商品
const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS); // brandName: "SEA-DOO"
// ...
if (alive && s) setSettings({ ...DEFAULT_SETTINGS, ...s });
} catch { /* fallback to built-in data */ }
```

`DEFAULT_SETTINGS`（`src/api.ts`）的 `brandName: "SEA-DOO"`、`brandSub: "PREMIUM USED"`、
`copyrightText: "© 2025 SEA-DOO PREMIUM USED"` 被用作**首屏同步初始值**，`src/data/inventory.ts`
的 6 条演示商品同理。因此从首屏渲染到 `/api/settings` + `/api/products` 返回之前，
用户看到的是**另一个品牌 + 不存在的库存**。

**为什么这次才暴露**：本地 `vite preview` 下接口瞬时返回，截不到该状态；线上经代理实测
`/api/settings` 耗时 **~1.0–1.7s**（五次采样均 200，接口本身稳定，是链路延迟），
而审计等待窗口为 600ms，正好落在闪现区间内。

**影响**：品牌与库存对不上（DY_RIDE vs SEA-DOO、18 件 vs 4 件），冷启动/弱网下可见约 1 秒；
对目标市场的移动端用户尤其明显。

**建议修复**（属独立改动，本次未实施，待确认）：引入 `loaded` 标记，
在接口返回前对**品牌文案 / Hero / 库存列表**渲染骨架屏，而不是渲染兜底数据；
或让 `DEFAULT_SETTINGS` 至少改成中性占位（不含具体品牌名与年份）。

### 附带发现

- **`seatoys.aaatslydaaa.ru` 从未上线**：nic.ru 权威 DNS 返回 **NXDOMAIN**，
  无 A 记录，服务器上也没有对应证书目录。若要启用，需先在 nic.ru 添加 A 记录指向
  `170.168.89.127`，再执行 `deploy.py cert`（顺序不可颠倒）。
- 服务器 `seadoo.conf` 中的 `seadoo.aaastlydaaa.ru`（`aaast-`）是**有意的错拼纠错 301 块**，非笔误。
- 本次仅部署前端（移动端修复均为前端改动）。`server/`、`deploy/deploy.py`、`vite.config.ts` 等
  仍有未提交改动，属此前会话遗留，未纳入本次部署范围。
