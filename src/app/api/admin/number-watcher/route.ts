import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getNumberCheapest } from "@/lib/herosms";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/telegram";
import { NextResponse } from "next/server";

// Holds a number reserved by the watcher so it can be handed to the registration flow.
// If the user doesn't use it, we rely on them to cancel or the page can cancel it on unload.
let reservedNumber: { activationId: string; phoneNumber: string; price: number | null; operator: string | undefined } | null = null;

// Telegram notification state
let lastNotifiedAvailable = false;
let lastNotifiedAt = 0;
const MIN_NOTIFY_INTERVAL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxPriceParam = searchParams.get("maxPrice");
  const maxPrice = maxPriceParam ? parseFloat(maxPriceParam) : undefined;
  const operatorPriority = searchParams.get("operatorPriority") || undefined;
  const service = "ot";

  let available = false;
  let error: string | null = null;

  // If we already reserved a number from a previous poll, it's still available.
  if (reservedNumber) {
    available = true;
  } else {
    // The only reliable availability test: try to actually get a number.
    try {
      const result = await getNumberCheapest(service, maxPrice, operatorPriority);
      reservedNumber = { activationId: result.activationId, phoneNumber: result.phoneNumber, price: result.price ?? null, operator: result.operator };
      available = true;
      console.log(`[NumberWatcher] Reserved number: ${result.phoneNumber} (${result.activationId})`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      available = false;
      reservedNumber = null;
    }
  }

  const now = Date.now();

  if (available && !lastNotifiedAvailable) {
    if (now - lastNotifiedAt > MIN_NOTIFY_INTERVAL_MS) {
      const msg = `✅ <b>HeroSMS Numbers Available!</b>\n\nService: <code>${service}</code>\nReserved: ${reservedNumber ? `<code>${reservedNumber.phoneNumber}</code>` : "yes"}\n\nRestock your CBTL accounts now!`;
      const sent = await sendTelegramMessage(msg);
      lastNotifiedAvailable = true;
      lastNotifiedAt = now;
      console.log(`[NumberWatcher] Notified Telegram (sent=${sent}): number available`);
    }
  } else if (!available && lastNotifiedAvailable) {
    lastNotifiedAvailable = false;
    console.log("[NumberWatcher] Numbers depleted — notification reset");
  }

  return NextResponse.json({
    service,
    available,
    error,
    telegramConfigured: isTelegramConfigured(),
    lastNotifiedAt: lastNotifiedAt || null,
    reservedNumber,
    watching: true
  });
}

// POST /api/admin/number-watcher — take or cancel the reserved number
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { action } = await request.json().catch(() => ({}));

  if (action === "take") {
    if (!reservedNumber) {
      return NextResponse.json({ message: "No reserved number available" }, { status: 400 });
    }
    const taken = reservedNumber;
    reservedNumber = null;
    lastNotifiedAvailable = false; // reset so we can reserve another next poll
    return NextResponse.json({ success: true, ...taken });
  }

  if (action === "cancel") {
    reservedNumber = null;
    lastNotifiedAvailable = false;
    return NextResponse.json({ success: true, message: "Reservation cleared" });
  }

  return NextResponse.json({ message: "Invalid action" }, { status: 400 });
}
