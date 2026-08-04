import { getShopeeEnv, getValidAccessToken, generateSignature, saveTokens } from "@/lib/shopee-token";

const SHOPEE_API_BASE =
  process.env.SHOPEE_ENV === "live"
    ? "https://partner.shopeemobile.com"
    : "https://openplatform.sandbox.test-stable.shopee.sg";

const SHOPEE_AUTH_BASE =
  process.env.SHOPEE_ENV === "live"
    ? "https://open.shopee.com"
    : "https://open.test-stable.shopee.com";

export function getApiBase(): string {
  return SHOPEE_API_BASE;
}

export function getAuthBase(): string {
  return SHOPEE_AUTH_BASE;
}

/**
 * Build the new Shopee Open Platform authorization page URL.
 * No signature/timestamp required for the login page itself.
 */
export function buildAuthorizationLink(redirectUri: string): string {
  const { partnerId } = getShopeeEnv();
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    auth_type: "seller",
    redirect_uri: redirectUri,
    response_type: "code"
  });
  return `${SHOPEE_AUTH_BASE}/auth?${params.toString()}`;
}

export async function buildSignedApiUrl(
  path: string,
  extraParams: Record<string, string | number> = {}
): Promise<string> {
  const { partnerId, partnerKey } = getShopeeEnv();
  const token = await getValidAccessToken();

  if (!token) {
    throw new Error("No valid Shopee access token. Authorize your shop first.");
  }

  const { shopId, accessToken } = token;
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(path, timestamp, partnerKey, partnerId, accessToken, shopId);

  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    shop_id: String(shopId),
    access_token: accessToken,
    ...Object.fromEntries(Object.entries(extraParams).map(([k, v]) => [k, String(v)]))
  });

  return `${SHOPEE_API_BASE}${path}?${params.toString()}`;
}

export async function shopeeGet<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = await buildSignedApiUrl(path, params);
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Shopee GET error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function shopeePost<T>(
  path: string,
  body: Record<string, unknown>,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = await buildSignedApiUrl(path, params);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 0 }
  });
  if (!res.ok) throw new Error(`Shopee POST error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Backwards-compatible exports for token/signature helpers
export { getShopeeEnv as getShopeeConfig, getValidAccessToken, generateSignature, saveTokens } from "@/lib/shopee-token";

