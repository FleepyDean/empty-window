import { NextResponse } from "next/server";
import { buildAuthUrl, getShopeeConfig } from "@/lib/shopee-api";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://nishinae.store"}/api/shopee/auth`;

// GET /api/shopee/auth
// - If "code" param present: exchange for tokens (OAuth callback)
// - Else: redirect to Shopee authorization page
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");

  // Step 2: Exchange code for access_token + refresh_token
  if (code && shopId) {
    try {
      const path = "/api/v2/auth/token/get";
      const url = buildAuthUrl(path);
      const { partnerId } = getShopeeConfig();

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          shop_id: Number(shopId),
          partner_id: partnerId
        })
      });

      const data = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        shop_id?: number;
        error?: string;
        message?: string;
      };

      if (data.error && data.error !== "" && data.error !== "error_none") {
        return NextResponse.json(
          { message: data.message ?? data.error },
          { status: 400 }
        );
      }

      // Return tokens for manual env setup
      // In production these should be stored in DB or env
      return NextResponse.json({
        message: "Authorization successful! Add these to your Railway environment variables:",
        SHOPEE_ACCESS_TOKEN: data.access_token,
        SHOPEE_REFRESH_TOKEN: data.refresh_token,
        SHOPEE_SHOP_ID: data.shop_id ?? Number(shopId)
      });
    } catch (err) {
      return NextResponse.json(
        { message: err instanceof Error ? err.message : "Token exchange failed" },
        { status: 500 }
      );
    }
  }

  // Step 1: Build Shopee authorization URL and redirect
  try {
    const path = "/api/v2/shop/auth_partner";
    const url = buildAuthUrl(path);
    const authUrl = `${url}&redirect=${encodeURIComponent(REDIRECT_URI)}`;
    // Return the URL as JSON too so it can be opened manually if redirect blocked
    return NextResponse.json({ authUrl, note: "Open authUrl in your browser to authorize" });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Auth URL build failed" },
      { status: 500 }
    );
  }
}

// POST /api/shopee/auth/refresh
// Refreshes expired access_token using refresh_token
export async function POST() {
  try {
    const { partnerId, shopId } = getShopeeConfig();
    const refreshToken = process.env.SHOPEE_REFRESH_TOKEN ?? "";

    if (!refreshToken) {
      return NextResponse.json({ message: "No refresh token configured" }, { status: 400 });
    }

    const path = "/api/v2/auth/access_token/get";
    const url = buildAuthUrl(path);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
        shop_id: shopId,
        partner_id: partnerId
      })
    });

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      message?: string;
    };

    if (data.error && data.error !== "" && data.error !== "error_none") {
      return NextResponse.json({ message: data.message ?? data.error }, { status: 400 });
    }

    return NextResponse.json({
      message: "Token refreshed! Update Railway env vars:",
      SHOPEE_ACCESS_TOKEN: data.access_token,
      SHOPEE_REFRESH_TOKEN: data.refresh_token
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
