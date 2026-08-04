import { NextResponse } from "next/server";
import { buildAuthorizationLink } from "@/lib/shopee-api";
import { buildAuthApiUrl, getShopeeEnv, saveTokens } from "@/lib/shopee-token";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://nishinae.store"}/api/shopee/auth`;

// GET /api/shopee/auth
// - If "code" param present: exchange for tokens (OAuth callback)
// - Else: generate Shopee authorization link
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");
  const mainAccountId = searchParams.get("main_account_id");

  // Step 2: Exchange code for access_token + refresh_token
  if (code && (shopId || mainAccountId)) {
    try {
      const path = "/api/v2/auth/token/get";
      const url = buildAuthApiUrl(path);
      const { partnerId, environment } = getShopeeEnv();

      const body: Record<string, unknown> = { code, partner_id: partnerId };
      if (shopId) body.shop_id = Number(shopId);
      if (mainAccountId) body.main_account_id = Number(mainAccountId);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        shop_id?: number;
        main_account_id?: number;
        error?: string;
        message?: string;
      };

      if (data.error && data.error !== "" && data.error !== "error_none") {
        return NextResponse.json(
          { message: data.message ?? data.error },
          { status: 400 }
        );
      }

      const finalShopId = data.shop_id ?? Number(shopId) ?? 0;
      if (data.access_token && data.refresh_token && finalShopId) {
        await saveTokens({
          shopId: finalShopId,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          environment
        });
      }

      return NextResponse.json({
        message: "Authorization successful! Tokens are saved to the database.",
        SHOPEE_SHOP_ID: finalShopId,
        SHOPEE_MAIN_ACCOUNT_ID: data.main_account_id ?? mainAccountId
      });
    } catch (err) {
      return NextResponse.json(
        { message: err instanceof Error ? err.message : "Token exchange failed" },
        { status: 500 }
      );
    }
  }

  // Step 1: Build Shopee authorization URL
  try {
    const authUrl = buildAuthorizationLink(REDIRECT_URI);
    return NextResponse.json({ authUrl, note: "Open authUrl in your browser to authorize" });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Auth URL build failed" },
      { status: 500 }
    );
  }
}
