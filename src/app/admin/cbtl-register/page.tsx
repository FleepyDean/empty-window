"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

type DisabledEmail = {
  id: number;
  emailAddress: string;
  voucherExpiresAt: string | null;
};

type SmsSession = {
  activationId: string;
  phoneNumber: string;
  otp: string | null;
  status: "waiting" | "success" | "cancelled";
  price: number | null;
  operator: string | null;
};

type AccountEntry = {
  emailId: number;
  email: string;
  smsOtp: string | null;
  emailOtp: string | null;
  phoneNumber: string | null;
  doneAt: string;
};

const SERVICE = "ot"; // "Any other" service on HeroSMS
const POLL_INTERVAL_MS = 4000;
const SS_KEY = "cbtl_register_session";

type PersistedSession = {
  activeEmailId: number;
  activeEmailAddress: string;
  sms: { activationId: string; phoneNumber: string; otp: string | null; status: string; price: number | null; operator: string | null } | null;
  smsRequestedAt: number | null;
  emailOtp: string | null;
  emailOtpStatus: string;
  emailPollingSince: string | null;
};

function saveSession(data: Partial<PersistedSession>) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(SS_KEY) ?? "null") ?? {};
    sessionStorage.setItem(SS_KEY, JSON.stringify({ ...existing, ...data }));
  } catch { /* ignore */ }
}

function clearSession() {
  try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
}

const OPERATOR_LABELS: Record<string, string> = {
  u_mobile: "U Mobile",
  hotlink: "Hotlink",
  tune_talk: "Tune Talk",
  xox: "XOX",
  celcom: "Celcom",
  yes: "YES",
  unifi: "Unifi",
  digi: "DiGi",
  yoodo: "Yoodo",
};

function formatOperator(op: string): string {
  return OPERATOR_LABELS[op] ?? op;
}

export default function CbtlRegisterPage() {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [emails, setEmails] = useState<DisabledEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  const [activeEmailId, setActiveEmailId] = useState<number | null>(null);
  const [sms, setSms] = useState<SmsSession | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [smsRequestedAt, setSmsRequestedAt] = useState<number | null>(null);

  const [emailOtp, setEmailOtp] = useState<string | null>(null);
  const [emailOtpStatus, setEmailOtpStatus] = useState<"idle" | "polling" | "success">("idle");

  const [completed, setCompleted] = useState<AccountEntry[]>([]);
  const [activating, setActivating] = useState(false);

  // Number watcher state
  const [watching, setWatching] = useState(false);
  const [watcherStatus, setWatcherStatus] = useState<{ available: boolean; reservedNumber: { activationId: string; phoneNumber: string } | null; telegramConfigured: boolean } | null>(null);
  const watcherRef = useRef<NodeJS.Timeout | null>(null);

  // Max price setting (persisted in localStorage)
  const [maxPrice, setMaxPrice] = useState<string>("0.0799");
  const [maxPriceInput, setMaxPriceInput] = useState<string>("0.0799");
  const [operatorPriority, setOperatorPriority] = useState<string>("u_mobile");
  const MAX_PRICE_KEY = "cbtl_max_price";
  const OPERATOR_PRIORITY_KEY = "cbtl_operator_priority";

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);
  const emailPollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  async function fetchBalance() {
    setBalanceLoading(true);
    try {
      const res = await fetch("/api/admin/cbtl-register/sms", { method: "PATCH" });
      const d = await res.json();
      if (res.ok) setBalance(d.balance);
      else toast.error(d.message ?? "Failed to fetch balance.");
    } catch {
      toast.error("Failed to fetch balance.");
    } finally {
      setBalanceLoading(false);
    }
  }

  async function fetchEmails() {
    setEmailsLoading(true);
    try {
      const res = await fetch("/api/admin/email-accounts");
      const d = await res.json();
      if (res.ok) {
        const disabled: DisabledEmail[] = (d.accounts as { id: number; emailAddress: string; status: string; voucherExpiresAt: string | null }[])
          .filter((a) => a.status === "disabled")
          .map(({ id, emailAddress, voucherExpiresAt }) => ({ id, emailAddress, voucherExpiresAt }));
        setEmails(disabled);
      } else {
        toast.error(d.message ?? "Failed to fetch emails.");
      }
    } catch {
      toast.error("Failed to fetch emails.");
    } finally {
      setEmailsLoading(false);
    }
  }

  useEffect(() => {
    fetchBalance();
    fetchEmails();

    // Restore max price from localStorage
    const savedPrice = localStorage.getItem(MAX_PRICE_KEY);
    if (savedPrice) {
      setMaxPrice(savedPrice);
      setMaxPriceInput(savedPrice);
    }
    const savedOperator = localStorage.getItem(OPERATOR_PRIORITY_KEY);
    if (savedOperator !== null) setOperatorPriority(savedOperator);

    // Restore persisted session
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) {
        const s: PersistedSession = JSON.parse(raw);
        if (s.activeEmailId) setActiveEmailId(s.activeEmailId);
        if (s.emailOtp) { setEmailOtp(s.emailOtp); setEmailOtpStatus("success"); }
        else if (s.emailOtpStatus === "polling" && s.emailPollingSince && s.activeEmailAddress) {
          startEmailPolling(s.activeEmailAddress, new Date(s.emailPollingSince));
        }
        if (s.sms && s.sms.status === "waiting") {
          const smsData = { ...s.sms, status: "waiting" as const };
          setSms(smsData);
          setSmsRequestedAt(s.smsRequestedAt);
          if (s.smsRequestedAt) {
            setElapsed(Math.floor((Date.now() - s.smsRequestedAt) / 1000));
          }
          elapsedRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
          let smsFound = false;
          pollRef.current = setInterval(async () => {
            if (smsFound) return;
            try {
              const res = await fetch(`/api/admin/cbtl-register/sms?id=${s.sms!.activationId}`);
              const d = await res.json();
              if (d.status === "success" && d.otp && !smsFound) {
                smsFound = true;
                stopPolling();
                setSms((prev) => prev ? { ...prev, otp: d.otp, status: "success" } : prev);
                saveSession({ sms: { ...s.sms!, otp: d.otp, status: "success" } });
                toast.success(`OTP received: ${d.otp}`);
              } else if (d.status === "cancelled" && !smsFound) {
                smsFound = true;
                stopPolling();
                setSms((prev) => prev ? { ...prev, status: "cancelled" } : prev);
                saveSession({ sms: { ...s.sms!, status: "cancelled" } });
                toast.error("Number was cancelled externally.");
              }
            } catch { /* ignore */ }
          }, POLL_INTERVAL_MS);
          toast.info("Resumed session from before refresh.");
        } else if (s.sms) {
          setSms(s.sms as SmsSession);
          setSmsRequestedAt(s.smsRequestedAt);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // ── SMS polling ────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    pollRef.current = null;
    elapsedRef.current = null;
  }

  function stopEmailPolling() {
    if (emailPollRef.current) {
      clearInterval(emailPollRef.current);
      emailPollRef.current = null;
    }
  }

  function startEmailPolling(email: string, sinceOverride?: Date) {
    stopEmailPolling();
    const since = sinceOverride ?? new Date();
    setEmailOtp(null);
    setEmailOtpStatus("polling");
    saveSession({ emailOtpStatus: "polling", emailPollingSince: since.toISOString(), activeEmailAddress: email, emailOtp: null });

    let found = false;
    const poll = setInterval(async () => {
      if (found) return;
      try {
        const url = `/api/admin/cbtl-register/email-otp?email=${encodeURIComponent(email)}&since=${encodeURIComponent(since.toISOString())}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const d = await res.json();
        if (d.status === "success" && d.otp && !found) {
          found = true;
          stopEmailPolling();
          setEmailOtp(d.otp);
          setEmailOtpStatus("success");
          saveSession({ emailOtp: d.otp, emailOtpStatus: "success" });
          toast.success(`Email OTP received: ${d.otp}`);
        }
      } catch { /* ignore */ }
    }, 4000);

    emailPollRef.current = poll;
  }

  function startPolling(activationId: string) {
    stopPolling();
    setElapsed(0);

    elapsedRef.current = setInterval(() => {
      setElapsed((p) => p + 1);
    }, 1000);

    let smsFound = false;
    pollRef.current = setInterval(async () => {
      if (smsFound) return;
      try {
        const res = await fetch(`/api/admin/cbtl-register/sms?id=${activationId}`);
        const d = await res.json();
        if (d.status === "success" && d.otp && !smsFound) {
          smsFound = true;
          stopPolling();
          setSms((prev) => {
            if (prev) { saveSession({ sms: { ...prev, otp: d.otp, status: "success" } }); }
            return prev ? { ...prev, otp: d.otp, status: "success" } : prev;
          });
          toast.success(`OTP received: ${d.otp}`);
        } else if (d.status === "cancelled" && !smsFound) {
          smsFound = true;
          stopPolling();
          setSms((prev) => {
            if (prev) { saveSession({ sms: { ...prev, status: "cancelled" } }); }
            return prev ? { ...prev, status: "cancelled" } : prev;
          });
          toast.error("Number was cancelled externally.");
        }
      } catch {
        // ignore transient errors
      }
    }, POLL_INTERVAL_MS);
  }

  async function cancelCurrentNumber(activationId: string) {
    try {
      await fetch("/api/admin/cbtl-register/sms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activationId })
      });
    } catch {
      // best-effort
    }
    setSms(null);
    saveSession({ sms: null, smsRequestedAt: null });
  }

  useEffect(() => () => { stopPolling(); stopEmailPolling(); }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function requestNumber() {
    if (!activeEmailId) { toast.error("Select an email first."); return; }
    if (sms && sms.status === "waiting") {
      // cancel existing before requesting new
      stopPolling();
      await cancelCurrentNumber(sms.activationId);
    }
    setSmsLoading(true);
    try {
      const res = await fetch("/api/admin/cbtl-register/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: SERVICE,
          maxPrice: parseFloat(maxPrice),
          operatorPriority: operatorPriority || undefined
        })
      });
      const d = await res.json();
      if (res.ok) {
        const newSms = { activationId: d.activationId, phoneNumber: d.phoneNumber, otp: null, status: "waiting" as const, price: d.price ?? null, operator: d.operator ?? null };
        const requestedAt = Date.now();
        setSms(newSms);
        setElapsed(0);
        setSmsRequestedAt(requestedAt);
        saveSession({ sms: newSms, smsRequestedAt: requestedAt });
        startPolling(d.activationId);
        toast.success(`Number assigned: ${d.phoneNumber}` + (d.price ? ` ($${d.price})` : "") + (d.operator ? ` ${formatOperator(d.operator)}` : " Any operator"));
      } else {
        toast.error(d.message ?? "Failed to get number.");
      }
    } catch {
      toast.error("Failed to get number.");
    } finally {
      setSmsLoading(false);
    }
  }

  const CANCEL_LOCK_SECONDS = 120;

  async function cancelNumber() {
    if (!sms) return;
    if (smsRequestedAt) {
      const secondsSince = Math.floor((Date.now() - smsRequestedAt) / 1000);
      if (secondsSince < CANCEL_LOCK_SECONDS) {
        toast.error(`Cancellation disabled within 2 minutes. Wait ${CANCEL_LOCK_SECONDS - secondsSince}s more.`);
        return;
      }
    }
    stopPolling();
    await cancelCurrentNumber(sms.activationId);
    setSmsRequestedAt(null);
    saveSession({ sms: null, smsRequestedAt: null });
    toast.success("Number cancelled.");
  }

  async function resendSms() {
    if (!sms) return;
    setResendLoading(true);
    try {
      const res = await fetch("/api/admin/cbtl-register/sms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sms.activationId })
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setSms((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, otp: null, status: "waiting" as const };
          saveSession({ sms: updated });
          return updated;
        });
        setElapsed(0);
        setSmsRequestedAt(Date.now());
        saveSession({ smsRequestedAt: Date.now() });
        startPolling(sms.activationId);
        toast.success("Resend requested. Waiting for new SMS OTP...");
      } else {
        toast.error(d.message ?? "Failed to request resend.");
      }
    } catch {
      toast.error("Failed to request resend.");
    } finally {
      setResendLoading(false);
    }
  }

  async function markDone() {
    if (!activeEmailId) return;
    setActivating(true);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 14);
    const expiryIso = expiryDate.toISOString().split("T")[0];

    try {
      const res = await fetch("/api/admin/email-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeEmailId,
          status: "available",
          voucherExpiresAt: expiryIso
        })
      });
      if (res.ok) {
        const email = emails.find((e) => e.id === activeEmailId);
        setCompleted((prev) => [
          {
            emailId: activeEmailId,
            email: email?.emailAddress ?? "",
            smsOtp: sms?.otp ?? null,
            emailOtp: emailOtp,
            phoneNumber: sms?.phoneNumber ?? null,
            doneAt: new Date().toLocaleTimeString()
          },
          ...prev
        ]);
        setEmails((prev) => prev.filter((e) => e.id !== activeEmailId));
        stopPolling();
        stopEmailPolling();
        setSms(null);
        setEmailOtp(null);
        setEmailOtpStatus("idle");
        setActiveEmailId(null);
        clearSession();
        fetchBalance();
        toast.success("Account activated! Status set to available, expiry +14 days.");
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to activate.");
      }
    } catch {
      toast.error("Failed to activate.");
    } finally {
      setActivating(false);
    }
  }

  // ── Number watcher ──────────────────────────────────────────────────────────

  async function pollWatcher() {
    try {
      const params = new URLSearchParams({ maxPrice });
      if (operatorPriority) params.set("operatorPriority", operatorPriority);
      const res = await fetch("/api/admin/number-watcher?" + params.toString());
      if (!res.ok) return;
      const d = await res.json();
      setWatcherStatus({
        available: d.available,
        reservedNumber: d.reservedNumber ?? null,
        telegramConfigured: d.telegramConfigured
      });
      if (d.available && d.reservedNumber && !watcherStatus?.reservedNumber) {
        toast.success(`HeroSMS number reserved: ${d.reservedNumber.phoneNumber}`, { duration: 10000 });
      }
    } catch { /* ignore */ }
  }

  async function takeReservedNumber() {
    if (!activeEmailId) { toast.error("Select an email first."); return; }
    const email = emails.find((e) => e.id === activeEmailId);
    if (email) {
      copy(email.emailAddress, "email");
      startEmailPolling(email.emailAddress);
    }
    try {
      const res = await fetch("/api/admin/number-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "take" })
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.message ?? "Failed to take reserved number."); return; }
      const newSms: SmsSession = { activationId: d.activationId, phoneNumber: d.phoneNumber, otp: null, status: "waiting", price: d.price ?? null, operator: d.operator ?? null };
      const requestedAt = Date.now();
      setSms(newSms);
      setSmsRequestedAt(requestedAt);
      setElapsed(0);
      saveSession({ sms: newSms, smsRequestedAt: requestedAt });
      startPolling(d.activationId);
      toast.success(`Using reserved number: ${d.phoneNumber}` + (d.price ? ` ($${d.price})` : "") + (d.operator ? ` ${formatOperator(d.operator)}` : " Any operator"));
    } catch {
      toast.error("Failed to take reserved number.");
    }
  }

  async function cancelReservedNumber() {
    try {
      const res = await fetch("/api/admin/number-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" })
      });
      const d = await res.json();
      if (res.ok) {
        setWatcherStatus((prev) => prev ? { ...prev, available: false, reservedNumber: null } : null);
        toast.success("Reserved number cleared.");
      } else {
        toast.error(d.message ?? "Failed to clear reservation.");
      }
    } catch {
      toast.error("Failed to clear reservation.");
    }
  }

  function startWatching() {
    setWatching(true);
    pollWatcher();
    watcherRef.current = setInterval(pollWatcher, 30000);
  }

  function stopWatching() {
    setWatching(false);
    if (watcherRef.current) {
      clearInterval(watcherRef.current);
      watcherRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (watcherRef.current) clearInterval(watcherRef.current);
    };
  }, []);

  // ── Copy helper ────────────────────────────────────────────────────────────

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${label}`));
  }

  function saveMaxPrice() {
    const val = parseFloat(maxPriceInput);
    if (Number.isNaN(val) || val <= 0) {
      toast.error("Invalid price.");
      return;
    }
    setMaxPrice(String(val));
    localStorage.setItem(MAX_PRICE_KEY, String(val));
    toast.success("Max price updated to $" + val);
  }

  function saveOperatorPriority(value: string) {
    setOperatorPriority(value);
    localStorage.setItem(OPERATOR_PRIORITY_KEY, value);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeEmail = emails.find((e) => e.id === activeEmailId);
  // Reset email OTP state when switching email
  function selectEmail(id: number) {
    if (id === activeEmailId) return;
    setActiveEmailId(id);
    setSms(null);
    stopPolling();
    stopEmailPolling();
    setEmailOtp(null);
    setEmailOtpStatus("idle");
    clearSession();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      {/* Header */}
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">nishinae store</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Generate CBTL Account</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/admin/pools"
              className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Back to Pools
            </Link>
            <Link
              href="/admin"
              className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Admin Dashboard
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">HeroSMS Balance</p>
            <p className="mt-1 text-xl font-bold text-cyan-600 dark:text-cyan-400">
              {balance !== null ? "$" + balance : "—"}
            </p>
            <button
              onClick={fetchBalance}
              disabled={balanceLoading}
              className="mt-1 text-xs text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
            >
              {balanceLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className={"border p-4 " + (
            watcherStatus?.available
              ? "border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          )}>
            <p className="text-xs uppercase tracking-wide text-slate-500">Number Watcher</p>
            {watching ? (
              <>
                <p className={"mt-1 text-sm font-bold " + (
                  watcherStatus?.available
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-500"
                )}>
                  {watcherStatus?.available
                    ? "Number available!"
                    : watcherStatus ? "No numbers" : "Checking..."}
                </p>
                {watcherStatus?.available && watcherStatus.reservedNumber && (
                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={takeReservedNumber}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                    >
                      Use number
                    </button>
                    <button
                      onClick={cancelReservedNumber}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      Skip
                    </button>
                  </div>
                )}
                <button
                  onClick={stopWatching}
                  className="mt-1 text-xs text-red-500 hover:text-red-400"
                >
                  Stop watching
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-bold text-slate-400">Idle</p>
                <button
                  onClick={startWatching}
                  className="mt-1 text-xs text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
                >
                  Start watching
                </button>
              </>
            )}
            {watching && watcherStatus && !watcherStatus.telegramConfigured && (
              <p className="mt-1 text-xs text-amber-500">Telegram not configured</p>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3 border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Max Price:
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-400">$</span>
            <input
              type="text"
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveMaxPrice(); }}
              className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="0.0799"
            />
          </div>
          <button
            onClick={saveMaxPrice}
            className="rounded border border-cyan-500 px-3 py-1 text-xs font-semibold text-cyan-600 hover:bg-cyan-50 dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-950"
          >
            Apply
          </button>
          <span className="text-xs text-slate-400">Current: ${maxPrice}</span>
          <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
          <label htmlFor="operator-priority" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Operator Priority:
          </label>
          <select
            id="operator-priority"
            value={operatorPriority}
            onChange={(e) => saveOperatorPriority(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Any operator</option>
            <option value="hotlink">Hotlink</option>
            <option value="tune_talk">Tune Talk</option>
            <option value="xox">XOX</option>
            <option value="celcom">Celcom</option>
            <option value="yes">YES</option>
            <option value="unifi">Unifi</option>
            <option value="digi">DiGi</option>
            <option value="u_mobile">U Mobile</option>
            <option value="yoodo">Yoodo</option>
          </select>
        </div>

        {/* Main work area */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Left: email list */}
          <div className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Disabled Emails ({emails.length})
              </h2>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {emailsLoading ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">Loading...</p>
              ) : emails.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">No disabled emails.</p>
              ) : (
                emails.map((row) => (
                  <div
                    key={row.id}
                    onClick={() => selectEmail(row.id)}
                    className={"flex cursor-pointer items-center justify-between border-b border-slate-100 px-4 py-2.5 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 " + (activeEmailId === row.id ? "bg-cyan-50 dark:bg-cyan-900/20" : "")}
                  >
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {row.emailAddress}
                    </span>
                    {activeEmailId === row.id && (
                      <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">Selected</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: registration workspace */}
          <div className="flex flex-col gap-4">

            {/* Email detail */}
            <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Email</p>
              {activeEmail ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-slate-800 dark:text-white">{activeEmail.emailAddress}</span>
                  <button
                    onClick={() => {
                      copy(activeEmail.emailAddress, "email");
                      startEmailPolling(activeEmail.emailAddress);
                      requestNumber();
                    }}
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-400 dark:hover:text-cyan-400"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400">← Select an email from the list</p>
              )}
            </div>

            {/* Email OTP */}
            <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email OTP (from CBTL)</p>
                {emailOtpStatus === "polling" && (
                  <span className="text-xs text-amber-500">Polling inbox...</span>
                )}
              </div>
              {emailOtp ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-bold tracking-widest text-violet-600 dark:text-violet-400">
                    {emailOtp}
                  </span>
                  <button
                    onClick={() => copy(emailOtp, "Email OTP")}
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-400 dark:hover:text-cyan-400"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <p className="mb-3 text-xs text-slate-400">
                  {emailOtpStatus === "polling"
                    ? "Checking inbox for email to " + (activeEmail?.emailAddress ?? "...")
                    : "Not started"}
                </p>
              )}
            </div>

            {/* Phone number */}
            <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone Number</p>
                {sms?.status === "waiting" && (
                  <span className="text-xs text-slate-400">{elapsed}s</span>
                )}
              </div>

              {sms ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">
                      {sms.phoneNumber.replace(/^6/, "")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {sms.operator ? formatOperator(sms.operator) : "Any operator"}
                      </span>
                      {sms.price != null && (
                        <span className="text-xs text-slate-400">(${sms.price})</span>
                      )}
                    </div>
                    <button
                      onClick={() => copy(sms.phoneNumber.replace(/^6/, ""), "phone number")}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-400 dark:hover:text-cyan-400"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"inline-block rounded px-1.5 py-0.5 text-xs " + (
                      sms.status === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : sms.status === "cancelled"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      {sms.status === "waiting" ? "Waiting for OTP..." : sms.status}
                    </span>
                    {sms.status !== "success" && (
                      <button
                        onClick={cancelNumber}
                        className="text-xs text-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {smsRequestedAt && elapsed < CANCEL_LOCK_SECONDS
                          ? "Cancel (locked " + (CANCEL_LOCK_SECONDS - elapsed) + "s)"
                          : "Cancel number"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No number assigned yet.</p>
              )}

              {(!sms || (sms.status !== "waiting" && sms.status !== "success")) && (
                <button
                  onClick={requestNumber}
                  disabled={!activeEmailId || smsLoading}
                  className="mt-3 w-full border border-cyan-500 py-2 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-950"
                >
                  {smsLoading ? "Requesting..." : sms ? "Request New Number" : "Get Phone Number"}
                </button>
              )}
            </div>

            {/* SMS OTP */}
            <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">SMS OTP</p>
              {sms?.otp ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-2xl font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                    {sms.otp}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resendSms}
                      disabled={resendLoading}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-amber-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:border-amber-400 dark:hover:text-amber-400"
                    >
                      {resendLoading ? "Resending..." : "Resend SMS"}
                    </button>
                    <button
                      onClick={() => copy(sms.otp!, "SMS OTP")}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-400 dark:hover:text-cyan-400"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {sms?.status === "waiting" ? "Polling for SMS OTP..." : "—"}
                </p>
              )}
            </div>

            {/* Activate button */}
            <button
              onClick={markDone}
              disabled={!activeEmailId || activating}
              className="w-full bg-emerald-500 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-emerald-400"
            >
              {activating ? "Activating..." : "✓ Done"}
            </button>
          </div>
        </div>

        {/* Completed this session */}
        {completed.length > 0 && (
          <div className="mt-6 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Completed This Session ({completed.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-2 font-medium uppercase tracking-wide text-slate-500">Email</th>
                    <th className="px-4 py-2 font-medium uppercase tracking-wide text-slate-500">Phone</th>
                    <th className="px-4 py-2 font-medium uppercase tracking-wide text-slate-500">SMS OTP</th>
                    <th className="px-4 py-2 font-medium uppercase tracking-wide text-slate-500">Email OTP</th>
                    <th className="px-4 py-2 font-medium uppercase tracking-wide text-slate-500">Done At</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">{c.email}</td>
                      <td className="px-4 py-2 font-mono text-slate-500">{c.phoneNumber ?? "—"}</td>
                      <td className="px-4 py-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">{c.smsOtp ?? "—"}</td>
                      <td className="px-4 py-2 font-mono font-bold text-violet-600 dark:text-violet-400">{c.emailOtp ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-400">{c.doneAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
