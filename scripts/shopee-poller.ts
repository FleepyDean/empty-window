const SYNC_URL = process.env.SYNC_URL || "https://nishinae.store/api/shopee/cron";
const CRON_SECRET = process.env.SHOPEE_CRON_SECRET;
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "10000");

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOnce(): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (CRON_SECRET) headers["x-cron-secret"] = CRON_SECRET;

  const res = await fetch(SYNC_URL, {
    method: "POST",
    headers,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json().catch(() => null);
  const synced = data?.sync?.synced ?? data?.synced ?? 0;
  const message = data?.sync?.message ?? data?.message ?? "OK";

  if (synced > 0) {
    console.log(`[${new Date().toISOString()}] Synced ${synced} order(s): ${message}`);
  } else {
    console.log(`[${new Date().toISOString()}] No new orders (${message})`);
  }
}

async function startPoller(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Shopee poller starting`);
  console.log(`Polling ${SYNC_URL} every ${INTERVAL_MS}ms`);

  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Poll failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    await wait(INTERVAL_MS);
  }
}

startPoller().catch((err) => {
  console.error("Poller crashed:", err);
  process.exit(1);
});
