// ToyyibPay API Integration
// Docs: https://toyyibpay.com/apidoc

const TOYYIBPAY_API_KEY = process.env.TOYYIBPAY_API_KEY ?? "";
const TOYYIBPAY_CATEGORY_CODE = process.env.TOYYIBPAY_CATEGORY_CODE ?? "";
const TOYYIBPAY_BASE_URL = process.env.TOYYIBPAY_BASE_URL ?? "https://toyyibpay.com/index.php/api";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type CreateBillParams = {
  productName: string;
  description: string;
  amount: number; // in cents (RM 1.00 = 100)
  orderId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export type CreateBillResponse = {
  BillCode: string;
};

export async function createBill(params: CreateBillParams): Promise<CreateBillResponse> {
  const formData = new URLSearchParams({
    userSecretKey: TOYYIBPAY_API_KEY,
    categoryCode: TOYYIBPAY_CATEGORY_CODE,
    billName: params.productName.slice(0, 30), // Max 30 chars
    billDescription: params.description.slice(0, 200), // Max 200 chars
    billPriceSetting: "1", // 1 = fixed amount, 0 = customer decides
    billPayorInfo: "1",
    billAmount: params.amount.toString(), // in cents
    billReturnUrl: `${SITE_URL}/api/payment/return`,
    billCallbackUrl: `${SITE_URL}/api/payment/callback`,
    billExternalReferenceNo: params.orderId,
    billTo: params.customerName ?? "Customer",
    billEmail: params.customerEmail ?? "customer@example.com",
    billPhone: params.customerPhone ?? "0123456789",
    billSplitPayment: "0",
    billSplitPaymentArgs: "",
    billPaymentChannel: "2", // 2 = FPX + Card
    billDisplayMerchant: "1",
    billContentEmail: "Thank you for your purchase!",
    billChargeToCustomer: "0",
  });

  const response = await fetch(`${TOYYIBPAY_BASE_URL}/createBill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ToyyibPay createBill failed: ${error}`);
  }

  const data = await response.json();
  
  // Log the actual response for debugging
  console.log("ToyyibPay response:", JSON.stringify(data, null, 2));
  
  // Check if it's an error response
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.status === "error" || data.msg || data.message) {
      throw new Error(`ToyyibPay error: ${data.msg || data.message || JSON.stringify(data)}`);
    }
  }
  
  // ToyyibPay returns array with single object on success
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Invalid response from ToyyibPay: ${JSON.stringify(data)}`);
  }

  return data[0] as CreateBillResponse;
}

export async function getBillTransactions(billCode: string): Promise<unknown[]> {
  const formData = new URLSearchParams({
    userSecretKey: TOYYIBPAY_API_KEY,
    billCode,
  });

  const response = await fetch(`${TOYYIBPAY_BASE_URL}/getBillTransactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error("Failed to get bill transactions");
  }

  return response.json();
}

export function getPaymentUrl(billCode: string): string {
  // Use sandbox domain when in sandbox mode
  const isSandbox = TOYYIBPAY_BASE_URL.includes("dev.toyyibpay.com");
  const domain = isSandbox ? "https://dev.toyyibpay.com" : "https://toyyibpay.com";
  return `${domain}/${billCode}`;
}
