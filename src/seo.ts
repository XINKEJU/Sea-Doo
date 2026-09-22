/**
 * 逐页 SEO：单页应用里所有路由共用同一份静态 HTML 壳，
 * 若不按路由更新 <title> / canonical / og:url，会出现两个后果：
 * 1. 所有商品页在搜索结果里标题完全相同，无法区分（对 Yandex 尤其不利）；
 * 2. 若静态壳里写死指向首页的 canonical，会告诉搜索引擎「商品页的规范地址是首页」，
 *    直接把商品页从索引中挤掉。
 * 因此构建期不注入 canonical，改由本模块在路由挂载后写入正确的值。
 *
 * 说明：Google / Yandex 都会执行 JS 后再取 head，因此运行时写入是有效的；
 * 如需对不执行 JS 的抓取器友好，应补预渲染（见 README 的后续建议）。
 */
import { useEffect } from "react";

const SITE_URL = "https://seadoo.aaatslydaaa.ru";
const BASE_TITLE = "DY_RIDE — гидроциклы и мотовездеходы с пробегом | Челябинск";

function upsertMeta(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void): void {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  apply(el);
}

export interface SeoOptions {
  /** 页面标题；省略则用站点默认标题 */
  title?: string;
  /** 站内路径，如 "/" 或 "/inventory/xxx" */
  path: string;
  description?: string;
  /** 图片绝对地址，用于分享预览 */
  image?: string;
  /** 管理后台等不该被索引的页面 */
  noindex?: boolean;
}

export function useSeo({ title, path, description, image, noindex }: SeoOptions): void {
  useEffect(() => {
    const fullTitle = title ? `${title} | DY_RIDE` : BASE_TITLE;
    const url = `${SITE_URL}${path}`;

    document.title = fullTitle;

    if (noindex) {
      upsertMeta(
        'meta[name="robots"]',
        () => {
          const meta = document.createElement("meta");
          meta.setAttribute("name", "robots");
          return meta;
        },
        (el) => el.setAttribute("content", "noindex, nofollow"),
      );
    }

    upsertMeta(
      'link[rel="canonical"]',
      () => {
        const link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        return link;
      },
      (el) => el.setAttribute("href", url),
    );

    upsertMeta(
      'meta[property="og:url"]',
      () => {
        const meta = document.createElement("meta");
        meta.setAttribute("property", "og:url");
        return meta;
      },
      (el) => el.setAttribute("content", url),
    );

    upsertMeta(
      'meta[property="og:title"]',
      () => {
        const meta = document.createElement("meta");
        meta.setAttribute("property", "og:title");
        return meta;
      },
      (el) => el.setAttribute("content", fullTitle),
    );

    if (description) {
      upsertMeta(
        'meta[property="og:description"]',
        () => {
          const meta = document.createElement("meta");
          meta.setAttribute("property", "og:description");
          return meta;
        },
        (el) => el.setAttribute("content", description),
      );
    }

    if (image) {
      upsertMeta(
        'meta[property="og:image"]',
        () => {
          const meta = document.createElement("meta");
          meta.setAttribute("property", "og:image");
          return meta;
        },
        (el) => el.setAttribute("content", image),
      );
    }
  }, [title, path, description, image, noindex]);
}
