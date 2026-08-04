import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const ACCESS_TOKEN_TTL_MS = 4 * 60 * 60 * 1000 - 5 * 60 * 1000; // 3h 55m, refresh 5m before expiry
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000; // 29 days 23h

export function getShopeeEnv(): { partnerId: number; partnerKey: string; environment: string } {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
  const environment = process.env.SHOPEE_ENV === "live" ? "live" : "test";

  if (!partnerId || !partnerKey) {
    throw new Error("Missing SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY");
  }
  return { partnerId, partnerKey, environment };
}

export function generateSignature(
  path: string,
  timestamp: number,
  partnerKey: string,
  partnerId: number,
  accessToken?: string,
  shopId?: number
): string {
  let base = `${partnerId}${path}${timestamp}`;
  if (accessToken && shopId) {
    base += `${accessToken}${shopId}`;
  }
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

export function buildAuthApiUrl(path: string): string {
  const { partnerId, partnerKey, environment } = getShopeeEnv();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(path, timestamp, partnerKey, partnerId);
  const base =
    environment === "live"
      ? "https://partner.shopeemobile.com"
      : "https://openplatform.sandbox.test-stable.shopee.sg";
  return `${base}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
}

export async function getStoredTokens() {
  const { partnerId, environment } = getShopeeEnv();
  const shopId = Number(process.env.SHOPEE_SHOP_ID);
  if (!shopId) return null;

  return prisma.shopeeToken.findUnique({
    where: { shopId },
  });
}

export async function getValidAccessToken(): Promise<{ accessToken: string; shopId: number } | null> {
  const { environment } = getShopeeEnv();
  const shopId = Number(process.env.SHOPEE_SHOP_ID);
  if (!shopId) return null;

  // Fallback to env var if DB token missing (bridging until re-authorization)
  const envAccessToken = process.env.SHOPEE_ACCESS_TOKEN;
  const envRefreshToken = process.env.SHOPEE_REFRESH_TOKEN;

  const token = await prisma.shopeeToken.findUnique({ where: { shopId } });

  if (!token) {
    if (envAccessToken && envRefreshToken) {
      // Seed the env tokens but mark access token as immediately expiring
      // so getValidAccessToken will refresh on first real API call.
      await prisma.shopeeToken.upsert({
        where: { shopId },
        create: {
          shopId,
          accessToken: envAccessToken,
          refreshToken: envRefreshToken,
          environment,
          accessTokenExpiresAt: new Date(),
          refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
        },
        update: {
          accessToken: envAccessToken,
          refreshToken: envRefreshToken,
          environment,
          accessTokenExpiresAt: new Date(),
          refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
        }
      });
      return { accessToken: envAccessToken, shopId };
    }
    if (envAccessToken) {
      return { accessToken: envAccessToken, shopId };
    }
    return null;
  }

  const now = new Date();
  const accessExpiresAt = new Date(token.accessTokenExpiresAt);
  // If token is expired or about to expire, refresh it
  if (accessExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const refreshed = await refreshAndStoreToken(token.refreshToken, shopId);
    if (refreshed) return { accessToken: refreshed, shopId };
    if (envAccessToken) return { accessToken: envAccessToken, shopId };
    return null;
  }

  return { accessToken: token.accessToken, shopId };
}

async function refreshAndStoreToken(refreshToken: string, shopId: number): Promise<string | null> {
  const { partnerId, environment } = getShopeeEnv();
  const path = "/api/v2/auth/access_token/get";
  const url = buildAuthApiUrl(path);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
        shop_id: shopId,
        partner_id: partnerId,
      }),
    });

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      message?: string;
    };

    if (data.error && data.error !== "" && data.error !== "error_none") {
      console.error("Shopee token refresh error:", data.message ?? data.error);
      return null;
    }

    if (!data.access_token) return null;

    await saveTokens({
      shopId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      environment,
    });

    return data.access_token;
  } catch (err) {
    console.error("Shopee token refresh failed:", err);
    return null;
  }
}

export async function saveTokens({
  shopId,
  accessToken,
  refreshToken,
  environment,
}: {
  shopId: number;
  accessToken: string;
  refreshToken: string;
  environment: string;
}) {
  const now = Date.now();
  await prisma.shopeeToken.upsert({
    where: { shopId },
    create: {
      shopId,
      accessToken,
      refreshToken,
      environment,
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
    update: {
      accessToken,
      refreshToken,
      environment,
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  });
}
