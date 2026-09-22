/**
 * 业务实体类型定义。
 *
 * 说明：这里曾放在 `src/data/inventory.ts`，与一份 6 条 SEA-DOO 演示商品数据同文件。
 * 那份演示数据在数据层改造后已无人引用，但仍会被打包进产物、并且持续以
 * 「硬编码的 SEA-DOO 品牌 + © 2025」误导后续维护者（正是线上首屏闪现错误品牌那类 bug 的温床），
 * 故一并删除，仅保留类型。
 */

export interface JetSki {
  slug: string;
  model: string;
  year: number;
  hours: number;
  hp: number;
  engine: string;
  seats: number;
  system: string;
  trailer: string;
  documents: string;
  price: string;
  /** 数字价格（排序/统计用，展示仍用 price） */
  priceValue?: number;
  status: "available" | "sold";
  description: string;
  heroImage: string;
  images: string[];
}
