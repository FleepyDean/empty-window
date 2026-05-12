import { PRODUCT_CATALOG, type ProductKey, type ProductConfig } from "./products";

/**
 * Maps a free-text product name (e.g. from Shopee listing) to a known product key
 * via keyword matching. Returns null if no match found.
 */
export function matchProductByKeyword(rawName: string): ProductConfig | null {
  if (!rawName) return null;
  const normalized = rawName.toLowerCase();

  // Keyword patterns - more specific keywords first
  const keywordMap: Array<{ keywords: string[]; key: ProductKey }> = [
    { keywords: ["coffee bean", "cbtl", "tea leaf"], key: "cbtl" },
    { keywords: ["gigi"], key: "gigi" },
    { keywords: ["zus"], key: "zus" },
    { keywords: ["chagee", "cha gee"], key: "chagee" },
    { keywords: ["tealive", "tea live"], key: "tealive" },
    { keywords: ["kfc", "kentucky"], key: "kfc" },
    { keywords: ["winrar", "win rar"], key: "winrar" },
  ];

  for (const { keywords, key } of keywordMap) {
    if (keywords.some((kw) => normalized.includes(kw))) {
      const product = PRODUCT_CATALOG.find((p) => p.key === key);
      if (product) return product;
    }
  }

  return null;
}
