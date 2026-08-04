import crypto from "crypto";

const HITPAY_API_KEY = process.env.HITPAY_API_KEY ?? "";
const HITPAY_SALT = process.env.HITPAY_SALT ?? "";
const HITPAY_BASE_URL = process.env.HITPAY_BASE_URL ?? "https://api.hit-pay.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type CreatePaymentParams = {
  amount: number;
  currency?: string;
  paymentMethods?: string[];
  orderId: string;
  productName: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export type HitPayPaymentRequest = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  amount: string;
  currency: string;
  status: "pending" | "completed" | "failed" | "expired" | "canceled" | "inactive";
  purpose: string | null;
  reference_number: string | null;
  payment_methods: string[];
  url: string;
  redirect_url: string | null;
  webhook: string | null;
  created_at: string;
  updated_at: string;
};

export async function createPaymentRequest(
  params: CreatePaymentParams
): Promise<HitPayPaymentRequest> {
  const body: Record<string, unknown> = {
    amount: params.amount.toFixed(2),
    currency: params.currency ?? "MYR",
    payment_methods: params.paymentMethods ?? ["duitnow", "fpx", "touch_n_go", "grabpay_direct", "shopee_pay", "card"],
    purpose: params.productName.slice(0, 255),
    reference_number: params.orderId,
    redirect_url: `${SITE_URL}/api/payment/return`,
    webhook: `${SITE_URL}/api/payment/callback`,
    allow_repeated_payments: "false",
    send_email: "false",
    send_sms: "false",
  };

  if (params.customerName) body.name = params.customerName;
  if (params.customerEmail) body.email = params.customerEmail;
  if (params.customerPhone) body.phone = params.customerPhone;

  const response = await fetch(`${HITPAY_BASE_URL}/v1/payment-requests`, {
    method: "POST",
    headers: {
      "X-BUSINESS-API-KEY": HITPAY_API_KEY,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HitPay createPaymentRequest failed: ${error}`);
  }

  return response.json();
}

export async function getPaymentRequest(
  requestId: string
): Promise<HitPayPaymentRequest> {
  const response = await fetch(
    `${HITPAY_BASE_URL}/v1/payment-requests/${requestId}`,
    {
      method: "GET",
      headers: {
        "X-BUSINESS-API-KEY": HITPAY_API_KEY,
        "X-Requested-With": "XMLHttpRequest",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HitPay getPaymentRequest failed: ${error}`);
  }

  return response.json();
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  if (!HITPAY_SALT) return false;
  const computed = crypto
    .createHmac("sha256", HITPAY_SALT)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "utf-8"),
      Buffer.from(signature, "utf-8")
    );
  } catch {
    return false;
  }
}
