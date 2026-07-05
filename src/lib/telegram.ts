const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

export function isTelegramConfigured() {
  return !!BOT_TOKEN && !!CHAT_ID;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("[Telegram] Not configured — skipping message:", text);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML"
      })
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Telegram] sendMessage failed (${res.status}):`, body);
      return false;
    }

    console.log("[Telegram] Message sent:", text.substring(0, 80));
    return true;
  } catch (err) {
    console.error("[Telegram] sendMessage error:", err instanceof Error ? err.message : err);
    return false;
  }
}
