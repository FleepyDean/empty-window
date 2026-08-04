import { NextResponse } from "next/server";
import { getShopeeConfig, getApiBase, buildAuthorizationLink } from "@/lib/shopee-api";
import crypto from "crypto";

// GET /api/shopee/debug — diagnose signature issues without exposing the key
export async function GET() {
  try {
    const { partnerId, partnerKey, shopId, accessToken } = getShopeeConfig();
    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);

    const base = `${partnerId}${path}${timestamp}`;
    const sign = crypto.createHmac("sha256", partnerKey).update(base).digest("hex");

    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://nishinae.store"}/api/shopee/auth`;
    const authLink = buildAuthorizationLink(redirectUri);

    return NextResponse.json({
      apiBase: getApiBase(),
      authLink,
      partnerId,
      partnerIdType: typeof partnerId,
      partnerKeyLength: partnerKey.length,
      partnerKeyTrimmedLength: partnerKey.trim().length,
      partnerKeyHasWhitespace: partnerKey !== partnerKey.trim(),
      partnerKeyFirst3: partnerKey.substring(0, 3),
      partnerKeyLast3: partnerKey.substring(partnerKey.length - 3),
      shopId,
      accessTokenPresent: !!accessToken,
      path,
      timestamp,
      baseString: base,
      baseStringLength: base.length,
      signature: sign,
      signatureLength: sign.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Debug failed" },
      { status: 500 }
    );
  }
}
