import crypto from "crypto";

// Switch to live URL after Go Live approval:
// https://partner.shopeemobile.com
const SHOPEE_API_BASE =
  process.env.SHOPEE_ENV === "live"
    ? "https://partner.shopeemobile.com"
    : "https://partner.test-stable.shopeemobile.com";

export function getShopeeConfig() {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
  const shopId = Number(process.env.SHOPEE_SHOP_ID ?? "0");
  const accessToken = process.env.SHOPEE_ACCESS_TOKEN ?? "";

  if (!partnerId || !partnerKey) {
    throw new Error("Missing SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY env vars");
  }
  return { partnerId, partnerKey, shopId, accessToken };
}

export function generateSignature(
  path: string,
  timestamp: number,
  partnerKey: string,
  partnerId: number,
  accessToken?: string,
  shopId?: number
): string {
  // SOP V2: partner_id + path + timestamp [+ access_token + shop_id]
  let base = `${partnerId}${path}${timestamp}`;
  if (accessToken && shopId) {
    base += `${accessToken}${shopId}`;
  }
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

export function buildUrl(
  path: string,
  extraParams: Record<string, string | number> = {},
  withShop = true
): string {
  const { partnerId, partnerKey, shopId, accessToken } = getShopeeConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(
    path,
    timestamp,
    partnerKey,
    partnerId,
    withShop ? accessToken : undefined,
    withShop ? shopId : undefined
  );

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    ...(withShop && shopId ? { shop_id: String(shopId), access_token: accessToken } : {}),
    ...Object.fromEntries(Object.entries(extraParams).map(([k, v]) => [k, String(v)]))
  });

  return `${SHOPEE_API_BASE}${path}?${params.toString()}`;
}

export function buildAuthUrl(path: string): string {
  const { partnerId, partnerKey } = getShopeeConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(path, timestamp, partnerKey, partnerId);
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign
  });
  return `${SHOPEE_API_BASE}${path}?${params.toString()}`;
}

export function getApiBase(): string {
  return SHOPEE_API_BASE;
}

export async function shopeeGet<T>(
  path: string,
  params: Record<string, string | number> = {},
  withShop = true
): Promise<T> {
  const url = buildUrl(path, params, withShop);
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Shopee GET error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function shopeePost<T>(
  path: string,
  body: Record<string, unknown>,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = buildUrl(path, params, true);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 0 }
  });
  if (!res.ok) throw new Error(`Shopee POST error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
