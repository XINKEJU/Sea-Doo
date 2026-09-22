// 移动端适配审计 v2：真实 Chromium + CDP，多种移动视口
// v2 改进：
//  - 测量前等待样式表真正生效（v1 中 @import 阻塞导致部分页面在无样式状态下被测量）
//  - 屏蔽 Google Fonts 域，验证外部字体不可用时样式表仍立即生效（俄罗斯网络环境的现实条件）
//  - 后台列表行契约改为读取 computed style，避免用尺寸差推断造成假阳性
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9333;
const BASE = "http://127.0.0.1:4173";
const OUT_DIR = "/tmp/seadoo-mobile-audit";

const VIEWPORTS = [
  { name: "320x568-SE1", w: 320, h: 568, dsf: 2 },
  { name: "360x740-Android", w: 360, h: 740, dsf: 3 },
  { name: "375x812-iPhoneX", w: 375, h: 812, dsf: 3 },
  { name: "390x844-iPhone14", w: 390, h: 844, dsf: 3 },
  { name: "414x896-iPhoneXR", w: 414, h: 896, dsf: 3 },
  { name: "768x1024-iPadPortrait", w: 768, h: 1024, dsf: 2 },
];

const PAGES = [
  { name: "home", path: "/" },
  { name: "detail", path: "/inventory/rxt-x-rs-300-2023" },
  { name: "admin-login", path: "/admin" },
  { name: "notfound", path: "/no-such-page" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
    return r.result.value;
  }
}

const AUDIT_JS = `(() => {
  const vw = window.innerWidth;
  const cssApplied = getComputedStyle(document.documentElement).getPropertyValue('--page-x').trim() !== '';
  const clipX = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  const cls = (el) => typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';

  const res = {
    cssApplied,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    overflow: document.documentElement.scrollWidth - vw,
    overflowers: [], smallFonts: [], smallTargets: [], bigImages: [],
    textAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust || '(none)',
  };
  if (!cssApplied) return res;

  const els = Array.from(document.querySelectorAll('body *'));
  const seen = new Set();
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (clipX(el)) continue;
    const key = el.tagName + '|' + cls(el) + '|' + Math.round(r.left) + '|' + Math.round(r.right);
    if (seen.has(key)) continue;
    seen.add(key);
    res.overflowers.push({ tag: el.tagName, cls: cls(el).slice(0, 70), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 30) });
  }
  res.overflowers = res.overflowers.slice(0, 20);

  const fontMap = new Map();
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)) continue;
    const fs = parseFloat(cs.fontSize);
    if (fs >= 12) continue;
    const sample = (el.textContent || '').trim().slice(0, 24);
    const key = fs + '|' + sample;
    if (fontMap.has(key)) continue;
    fontMap.set(key, { fontSize: fs, tag: el.tagName, cls: cls(el).slice(0, 50), sample });
  }
  res.smallFonts = Array.from(fontMap.values()).sort((a, b) => a.fontSize - b.fontSize).slice(0, 20);

  const targetMap = new Map();
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.height >= 44 && r.width >= 44) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 24);
    const key = el.tagName + '|' + label + '|' + Math.round(r.width) + 'x' + Math.round(r.height);
    if (targetMap.has(key)) continue;
    targetMap.set(key, { tag: el.tagName, label, cls: cls(el).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  }
  res.smallTargets = Array.from(targetMap.values()).slice(0, 20);

  const imgMap = new Map();
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (!img.naturalWidth || r.width < 1) continue;
    const needed = r.width * window.devicePixelRatio;
    if (img.naturalWidth <= needed * 1.6) continue;
    const key = img.currentSrc || img.src;
    if (imgMap.has(key)) continue;
    imgMap.set(key, { natural: img.naturalWidth, displayW: Math.round(r.width), overshoot: +(img.naturalWidth / needed).toFixed(2) });
  }
  res.bigImages = Array.from(imgMap.values()).slice(0, 10);

  return res;
})()`;

const ADMIN_CONTRACT_JS = `(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:100%;';
  host.innerHTML = '<div class="admin-item" id="aitem" style="background:#fff;padding:14px 16px">'
    + '<div class="admin-item__thumb" style="background:#E8E6E2"></div>'
    + '<div style="flex:1;min-width:0"><div>XPLORER 170 2024</div>'
    + '<div>2024 · 120 моточ. · 170 л.с. · 6 фото</div></div>'
    + '<div style="text-align:right;flex:0 0 auto"><div>1 850 000 ₽</div></div>'
    + '<div class="admin-item__actions"><button class="btn-touch">编辑</button><button class="btn-touch">删除</button></div></div>';
  document.body.appendChild(host);
  const item = document.getElementById('aitem');
  const ics = getComputedStyle(item);
  const ir = item.getBoundingClientRect();
  const inner = ir.width - parseFloat(ics.paddingLeft) - parseFloat(ics.paddingRight);
  const thumb = item.querySelector('.admin-item__thumb');
  const tcs = getComputedStyle(thumb);
  const tr = thumb.getBoundingClientRect();
  const actions = item.querySelector('.admin-item__actions');
  const acs = getComputedStyle(actions);
  const ar = actions.getBoundingClientRect();
  const btns = Array.from(actions.querySelectorAll('button'));
  const out = {
    cssApplied: getComputedStyle(document.documentElement).getPropertyValue('--page-x').trim() !== '',
    itemDisplay: ics.display,
    itemFlexWrap: ics.flexWrap,
    itemInnerWidth: Math.round(inner),
    itemRightEdge: Math.round(ir.right),
    thumbW: Math.round(tr.width),
    thumbH: Math.round(tr.height),
    thumbFlexShrink: tcs.flexShrink,
    actionsDisplay: acs.display,
    actionsWidth: Math.round(ar.width),
    actionsTakesOwnRow: Math.round(ar.width) >= Math.round(inner) - 1,
    actionsBelowFirstRow: ar.top >= tr.bottom - 1,
    buttonHeights: btns.map((b) => Math.round(b.getBoundingClientRect().height)),
    docOverflowAfterInject: document.documentElement.scrollWidth - window.innerWidth,
  };
  host.remove();
  return out;
})()`;

const MODAL_OPEN_JS = `(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const b = btns.find((x) => /СВЯЗАТЬСЯ/i.test(x.textContent)) || btns[0];
  if (!b) return false;
  b.click();
  return true;
})()`;

const MODAL_AUDIT_JS = `(() => {
  const sheet = document.querySelector('.modal-sheet');
  if (!sheet) return { found: false };
  const vw = window.innerWidth, vh = window.innerHeight;
  const sr = sheet.getBoundingClientRect();
  const cs = getComputedStyle(sheet);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const inputs = Array.from(sheet.querySelectorAll('input, textarea')).map((e) => ({
    tag: e.tagName,
    fs: parseFloat(getComputedStyle(e).fontSize),
    h: Math.round(e.getBoundingClientRect().height),
  }));
  const close = sheet.querySelector('.modal-close');
  const cr = close && close.getBoundingClientRect();
  const submit = sheet.querySelector('button[type=submit]');
  const sub = submit && submit.getBoundingClientRect();
  return {
    found: true,
    viewportW: vw, viewportH: vh,
    sheetW: Math.round(sr.width), sheetH: Math.round(sr.height),
    sheetTop: Math.round(sr.top), sheetBottom: Math.round(sr.bottom),
    anchoredToBottom: Math.abs(sr.bottom - vh) <= 1,
    withinViewport: sr.left >= -0.5 && sr.right <= vw + 0.5 && sr.top >= -0.5,
    maxHeight: cs.maxHeight,
    overflowY: cs.overflowY,
    contentScrollable: sheet.scrollHeight > sheet.clientHeight + 1,
    minInputFontSize: inputs.length ? Math.min(...inputs.map((i) => i.fs)) : null,
    inputHeights: inputs.map((i) => i.h),
    closeSize: cr ? [Math.round(cr.width), Math.round(cr.height)] : null,
    submitW: sub ? Math.round(sub.width) : null,
    submitH: sub ? Math.round(sub.height) : null,
    submitFillsWidth: sub ? Math.round(sub.width) >= Math.round(sr.width - padX) - 1 : null,
    bodyScrollLocked: document.body.style.position === 'fixed',
    paddingBottom: cs.paddingBottom,
    docOverflow: document.documentElement.scrollWidth - vw,
  };
})()`;

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`,
    "--user-data-dir=/tmp/chrome-mobile-audit", "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch {}
    await sleep(250);
  }
  if (!wsUrl) { chrome.kill(); throw new Error("无法连接 Chrome 调试端口"); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  // 模拟外部字体不可用（俄罗斯网络对 Google 服务常见）：验证样式表仍即时生效
  await cdp.send("Network.setBlockedURLs", { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] });

  const report = { generatedAt: new Date().toISOString(), fontsBlocked: true, results: [] };

  const ready = async (timeout = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await cdp.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--page-x').trim() !== '' " +
        "&& document.readyState === 'complete'"
      );
      if (ok) return true;
      await sleep(120);
    }
    return false;
  };

  for (const vp of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dsf, mobile: true });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

    for (const pg of PAGES) {
      await cdp.send("Page.navigate", { url: BASE + pg.path });
      const ok = await ready();
      await sleep(500); // 等待 React 数据回填 / 骨架屏结束
      const audit = await cdp.evaluate(AUDIT_JS);
      report.results.push({ viewport: vp.name, page: pg.name, styleReady: ok, ...audit });

      if (pg.name === "home" || pg.name === "detail" || pg.name === "admin-login") {
        const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        fs.writeFileSync(path.join(OUT_DIR, `${pg.name}-${vp.name}.png`), Buffer.from(shot.data, "base64"));
      }
    }

    // 联系弹窗（移动端底部抽屉）实测：打开后测量尺寸、输入字号、触控目标与滚动锁定
    await cdp.send("Page.navigate", { url: BASE + "/" });
    await ready();
    await sleep(400);
    const opened = await cdp.evaluate(MODAL_OPEN_JS);
    await sleep(600);
    const modal = await cdp.evaluate(MODAL_AUDIT_JS);
    report.results.push({ viewport: vp.name, page: "contact-modal", opened, ...modal });
    const shot2 = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT_DIR, `modal-${vp.name}.png`), Buffer.from(shot2.data, "base64"));

    await cdp.send("Page.navigate", { url: BASE + "/" });
    await ready();
    await sleep(400);
    const contract = await cdp.evaluate(ADMIN_CONTRACT_JS);
    report.results.push({ viewport: vp.name, page: "admin-item-contract", ...contract });
  }

  await cdp.send("Network.setBlockedURLs", { urls: [] }).catch(() => {});
  await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  ws.close();
  chrome.kill();

  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("audit written to", path.join(OUT_DIR, "report.json"));
}

main().catch((e) => { console.error("AUDIT FAILED:", e); process.exit(1); });
