/**
 * 全局数据层（settings / products）
 *
 * 解决的问题：
 * 1. **重复请求**——此前 Home 与 ProductDetail 各自请求一次 `/api/settings`，
 *    同一会话内每次切换路由都会重新拉取。本模块做模块级缓存 + 并发去重，
 *    同一份数据在 TTL 内只请求一次，后续路由切换是零延迟的同步读取。
 * 2. **首屏闪现错误内容**——此前页面以 `DEFAULT_SETTINGS`（brandName: "SEA-DOO"）
 *    与内置演示商品**同步初始化**，接口返回前会显示「SEA-DOO PREMIUM USED +
 *    © 2025 + 不存在的库存」。现在改为：数据未就绪时返回 `data === null`，
 *    由页面渲染骨架屏，**绝不渲染任何未经服务端确认的品牌与库存**。
 * 3. **弱网下的首屏等待**——对「上次成功拿到的真实数据」做 sessionStorage 水合，
 *    同标签页再次打开时立即以正确内容渲染，同时后台静默重新校验。
 *    注意存的必须是**服务端返回过的真实值**，而非硬编码兜底值——
 *    否则就退回成问题 2。
 *
 * 不使用 `DEFAULT_SETTINGS` 参与首屏渲染；它仅保留给后台表单做字段形状参考。
 */
import { useCallback, useSyncExternalStore } from "react";
import { api, type SiteSettings } from "./api";
import type { JetSki } from "./types";

export interface Resource<T> {
  /** 服务端确认过的数据；null 表示「尚未就绪」，页面应渲染骨架屏 */
  data: T | null;
  /** 首次加载中（已有数据时为后台重新校验，页面无需展示 loading） */
  loading: boolean;
  /** 最近一次请求失败；data 为 null 时应给出重试入口 */
  error: Error | null;
}

interface ResourceOptions {
  /** 缓存有效期：TTL 内切换页面不再发起请求 */
  ttl: number;
  storageKey?: string;
  /** 水合数据的最长可接受年龄（超过则忽略，避免长期显示过期内容） */
  storageTtl?: number;
  isValid: (value: unknown) => boolean;
}

interface ResourceHandle<T> {
  subscribe: (listener: () => void) => () => void;
  get: () => Resource<T>;
  reload: () => Promise<void>;
  invalidate: () => void;
}

function createResource<T>(fetcher: () => Promise<T>, opts: ResourceOptions): ResourceHandle<T> {
  let snapshot: Resource<T> = { data: null, loading: false, error: null };
  let fetchedAt = 0;
  let inflight: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const commit = (next: Resource<T>): void => {
    snapshot = next;
    notify();
  };

  // 首屏水合：只接受结构合法的「上次真实响应」，并在 10 分钟内有效
  if (opts.storageKey) {
    try {
      const raw = sessionStorage.getItem(opts.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { at?: number; data?: unknown };
        const age = Date.now() - (parsed.at ?? 0);
        if (age < (opts.storageTtl ?? 10 * 60_000) && opts.isValid(parsed.data)) {
          snapshot = { data: parsed.data as T, loading: false, error: null };
          fetchedAt = parsed.at ?? 0;
        }
      }
    } catch {
      /* 隐私模式 / 存储被禁用：忽略水合，退回骨架屏 */
    }
  }

  function persist(data: T): void {
    if (!opts.storageKey) return;
    try {
      sessionStorage.setItem(opts.storageKey, JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* 配额不足或存储被禁用：不影响正常使用 */
    }
  }

  async function load(force = false): Promise<void> {
    if (!force && snapshot.data !== null && Date.now() - fetchedAt < opts.ttl) return;
    if (inflight) return inflight;

    commit({ ...snapshot, loading: true, error: null });
    inflight = (async () => {
      try {
        const data = await fetcher();
        fetchedAt = Date.now();
        persist(data);
        commit({ data, loading: false, error: null });
      } catch (err) {
        // 保留已有数据（如果水合过），仅在确实无数据时让页面显示失败状态
        commit({
          data: snapshot.data,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // 首次订阅即触发：TTL 内直接命中缓存，不会产生请求
    void load();
    return () => {
      listeners.delete(listener);
    };
  }

  const get = (): Resource<T> => snapshot;

  return {
    subscribe,
    get,
    reload: () => load(true),
    /** 后台改完数据后调用，令下一次读取重新拉取 */
    invalidate: () => {
      fetchedAt = 0;
      if (opts.storageKey) {
        try {
          sessionStorage.removeItem(opts.storageKey);
        } catch {
          /* 忽略 */
        }
      }
    },
  };
}

const isSettings = (v: unknown): boolean =>
  typeof v === "object" && v !== null && typeof (v as SiteSettings).brandName === "string";

const isProductList = (v: unknown): boolean => Array.isArray(v);

const settingsResource = createResource<SiteSettings>(() => api.getSettings(), {
  ttl: 5 * 60_000,
  storageKey: "dyride.settings.v1",
  isValid: isSettings,
});

const productsResource = createResource<JetSki[]>(() => api.listProducts(), {
  ttl: 60_000,
  storageKey: "dyride.products.v1",
  isValid: isProductList,
});

/** 站点设置。data 为 null 表示尚未就绪，页面必须渲染骨架屏而不是兜底数据。 */
export function useSettings(): Resource<SiteSettings> {
  return useSyncExternalStore(settingsResource.subscribe, settingsResource.get, settingsResource.get);
}

/** 商品列表。 */
export function useProducts(): Resource<JetSki[]> {
  return useSyncExternalStore(productsResource.subscribe, productsResource.get, productsResource.get);
}

/** 后台写入商品后调用，使前台缓存失效（与 api.ts 内部缓存保持一致）。 */
export function invalidateProducts(): void {
  productsResource.invalidate();
  productResources.clear();
}

/** 后台写入站点设置后调用。 */
export function invalidateSettings(): void {
  settingsResource.invalidate();
}

export const reloadSettings = settingsResource.reload;
export const reloadProducts = productsResource.reload;

// ---------------------------------------------------------------------------
// 单条商品（详情页）
// ---------------------------------------------------------------------------
// 为什么不用全量列表拿单条：线上实测 /api/products 为 28.7KB（gzip 4.8KB），
// /api/products/:slug 仅 1.76KB（gzip 0.93KB）。直接以分享链接进入详情页的用户
// 不该为此下载整个目录。按 slug 建独立资源，重复访问同一车型还能命中内存缓存。
const EMPTY_PRODUCT: Resource<JetSki> = { data: null, loading: false, error: null };
const productResources = new Map<string, ResourceHandle<JetSki>>();

function productResource(slug: string): ResourceHandle<JetSki> {
  let handle = productResources.get(slug);
  if (!handle) {
    handle = createResource<JetSki>(() => api.getProduct(slug), {
      ttl: 60_000,
      isValid: (v) => typeof v === "object" && v !== null,
    });
    productResources.set(slug, handle);
  }
  return handle;
}

/** 单个商品。slug 为空时返回恒定的空资源。 */
export function useProduct(slug: string | undefined): Resource<JetSki> {
  const subscribe = useCallback(
    (listener: () => void) => (slug ? productResource(slug).subscribe(listener) : () => {}),
    [slug],
  );
  const getSnapshot = useCallback(
    () => (slug ? productResource(slug).get() : EMPTY_PRODUCT),
    [slug],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 详情页加载失败后的重试。 */
export function reloadProduct(slug: string): Promise<void> {
  return productResource(slug).reload();
}
