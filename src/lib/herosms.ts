const BASE_URL = process.env.HEROSMS_BASE_URL ?? "https://hero-sms.com/stubs/handler_api.php";
const API_KEY = process.env.HEROSMS_API_KEY ?? "";
const DEFAULT_SERVICE = process.env.HEROSMS_SERVICE ?? "aik";
const DEFAULT_COUNTRY = process.env.HEROSMS_COUNTRY ?? "7";

type HeroAction = "getNumber" | "getStatus" | "setStatus" | "getBalance" | "getPrices" | "getPricesVerification";

function assertConfig() {
  if (!API_KEY) throw new Error("HEROSMS_API_KEY is missing");
}

async function heroRequest(params: Record<string, string>) {
  assertConfig();
  const search = new URLSearchParams({ api_key: API_KEY, ...params });
  const url = `${BASE_URL}?${search.toString()}`;

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const text = (await response.text()).trim();

  if (!response.ok) {
    throw new Error(`HeroSMS HTTP ${response.status}: ${text}`);
  }

  return text;
}

/**
 * Recursively walk a prices payload and collect every {cost, count} pair where count > 0.
 * Handles both shapes:
 *   getPrices:             { country: { service: { cost, count } } }
 *   getPricesVerification: { country: { service: { operator: { cost, count } } } }
 */
function collectAvailableCosts(
  obj: unknown,
  serviceFilter: string,
  inServiceScope = false,
  out: number[] = []
): number[] {
  if (!obj || typeof obj !== "object") return out;
  // Leaf: { cost, count }
  const maybe = obj as { cost?: unknown; count?: unknown };
  if (typeof maybe.cost === "number" && typeof maybe.count === "number") {
    if (maybe.count > 0 && inServiceScope) out.push(maybe.cost);
    return out;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const nextScope = inServiceScope || key === serviceFilter;
    collectAvailableCosts(value, serviceFilter, nextScope, out);
  }
  return out;
}

export async function getMinPrice(service: string, country = DEFAULT_COUNTRY): Promise<number | null> {
  const candidateCosts: number[] = [];

  // 1) Try getPricesVerification (per-operator pricing — finer granularity)
  try {
    const raw = await heroRequest({
      action: "getPricesVerification" satisfies HeroAction,
      country,
      service
    });
    try {
      const parsed = JSON.parse(raw);
      collectAvailableCosts(parsed, service, false, candidateCosts);
    } catch {
      // not JSON — ignore
    }
  } catch {
    // endpoint may not be supported — ignore
  }

  // 2) Fall back to getPrices (consolidated pricing)
  try {
    const { prices } = await getPrices(service, country);
    collectAvailableCosts(prices, service, false, candidateCosts);
  } catch {
    // ignore
  }

  console.log(`[HeroSMS] getMinPrice service=${service} candidates=[${candidateCosts.join(",")}]`);
  if (candidateCosts.length === 0) return null;
  return Math.min(...candidateCosts);
}

export async function getNumber(service = DEFAULT_SERVICE, maxPrice?: number) {
  const params: Record<string, string> = {
    action: "getNumber" satisfies HeroAction,
    service,
    country: DEFAULT_COUNTRY
  };

  // Pass maxPrice if provided — HeroSMS will allocate from cheapest pool at or below this price
  if (maxPrice !== undefined) {
    params.maxPrice = String(maxPrice);
  }

  const raw = await heroRequest(params);

  // Expected: ACCESS_NUMBER:<id>:<number>
  const parts = raw.split(":");
  if (parts[0] !== "ACCESS_NUMBER" || parts.length < 3) {
    throw new Error(`HeroSMS getNumber failed: ${raw}`);
  }

  return {
    activationId: parts[1],
    phoneNumber: parts[2],
    service
  };
}

export async function getNumberCheapest(service = DEFAULT_SERVICE) {
  // Fetch current min price dynamically so we always get the cheapest operator.
  const minPrice = await getMinPrice(service).catch((e) => {
    console.error(`[HeroSMS] getMinPrice error:`, e instanceof Error ? e.message : e);
    return null;
  });
  console.log(`[HeroSMS] getNumberCheapest service=${service} minPrice=${minPrice}`);
  return getNumber(service, minPrice ?? undefined);
}

export async function getOtp(activationId: string) {
  const raw = await heroRequest({
    action: "getStatus" satisfies HeroAction,
    id: activationId
  });

  // Typical statuses:
  // STATUS_WAIT_CODE
  // STATUS_OK:<otp>
  // STATUS_CANCEL
  if (raw.startsWith("STATUS_OK:")) {
    // For specific services, response is "STATUS_OK:<code>".
    // For the generic "ot" (Any other) service, response includes full SMS body
    // which may contain colons, e.g. "STATUS_OK:[Appeton]: Your OTP 561920 is ready."
    // Strategy: take everything after the first ":" then extract the longest digit sequence (4-8 digits).
    const afterPrefix = raw.substring("STATUS_OK:".length).trim();
    let otp: string | null = afterPrefix || null;

    // If the payload is not purely digits, try to extract an OTP code from the message.
    if (otp && !/^\d+$/.test(otp)) {
      const matches = afterPrefix.match(/\d{4,8}/g);
      if (matches && matches.length > 0) {
        // Pick the longest digit sequence (most likely the OTP)
        otp = matches.reduce((a, b) => (b.length >= a.length ? b : a));
      }
    }

    return { otp, status: "success" as const };
  }

  if (raw === "STATUS_WAIT_CODE") {
    return { otp: null, status: "waiting_otp" as const };
  }

  if (raw === "STATUS_CANCEL") {
    return { otp: null, status: "cancelled" as const };
  }

  throw new Error(`HeroSMS getStatus unexpected response: ${raw}`);
}

export async function cancelNumber(activationId: string) {
  // SMS-Activate style: status=8 means cancel
  const raw = await heroRequest({
    action: "setStatus" satisfies HeroAction,
    id: activationId,
    status: "8"
  });

  // can vary by provider implementation; keep permissive
  return {
    cancelled: raw.includes("ACCESS_CANCEL") || raw.includes("STATUS_CANCEL") || raw === "OK",
    raw
  };
}

export async function getBalance() {
  const raw = await heroRequest({ action: "getBalance" });
  // Expected: ACCESS_BALANCE:<amount>
  if (!raw.startsWith("ACCESS_BALANCE:")) {
    throw new Error(`HeroSMS getBalance failed: ${raw}`);
  }
  return { balance: raw.split(":")[1] ?? "0", raw };
}

export async function getPrices(service?: string, country = DEFAULT_COUNTRY) {
  const params: Record<string, string> = {
    action: "getPrices" satisfies HeroAction,
    country
  };
  if (service) params.service = service;

  const raw = await heroRequest(params);

  try {
    // Response is JSON: { "<country>": { "<service>": { "cost": X, "count": Y } } }
    const parsed = JSON.parse(raw);
    return { prices: parsed, raw };
  } catch {
    throw new Error(`HeroSMS getPrices failed: ${raw}`);
  }
}