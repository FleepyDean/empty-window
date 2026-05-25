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
const MAX_POLL_SECONDS = 90;
const EMAIL_OTP_POLL_INTERVAL_MS = 5000;

export default function CbtlRegisterPage() {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [emails, setEmails] = useState<DisabledEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  const [activeEmailId, setActiveEmailId] = useState<number | null>(null);
  const [sms, setSms] = useState<SmsSession | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [emailOtp, setEmailOtp] = useState<string | null>(null);
  const [emailOtpStatus, setEmailOtpStatus] = useState<"idle" | "polling" | "success">("idle");

  const [completed, setCompleted] = useState<AccountEntry[]>([]);
  const [activating, setActivating] = useState(false);

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
  }, []);

  // ── SMS polling ────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    pollRef.current = null;
    elapsedRef.current = null;
  }

  function stopEmailPolling() {
    if (emailPollRef.current) clearInterval(emailPollRef.current);
    emailPollRef.current = null;
  }

  function startEmailPolling(email: string) {
    stopEmailPolling();
    const since = new Date();
    setEmailOtp(null);
    setEmailOtpStatus("polling");

    emailPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/admin/cbtl-register/email-otp?email=${encodeURIComponent(email)}&since=${encodeURIComponent(since.toISOString())}`
        );
        const d = await res.json();
        if (d.status === "success" && d.otp) {
          stopEmailPolling();
          setEmailOtp(d.otp);
          setEmailOtpStatus("success");
          toast.success(`Email OTP received: ${d.otp}`);
        }
      } catch {
        // ignore transient errors
      }
    }, EMAIL_OTP_POLL_INTERVAL_MS);
  }

  function startPolling(activationId: string) {
    stopPolling();
    setElapsed(0);

    elapsedRef.current = setInterval(() => {
      setElapsed((p) => p + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      setElapsed((prev) => {
        if (prev >= MAX_POLL_SECONDS) {
          stopPolling();
          toast.error("OTP timeout — number cancelled.");
          cancelCurrentNumber(activationId);
          return prev;
        }
        return prev;
      });

      try {
        const res = await fetch(`/api/admin/cbtl-register/sms?id=${activationId}`);
        const d = await res.json();
        if (d.status === "success" && d.otp) {
          stopPolling();
          setSms((prev) => prev ? { ...prev, otp: d.otp, status: "success" } : prev);
          toast.success(`OTP received: ${d.otp}`);
        } else if (d.status === "cancelled") {
          stopPolling();
          setSms((prev) => prev ? { ...prev, status: "cancelled" } : prev);
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
        body: JSON.stringify({ service: SERVICE })
      });
      const d = await res.json();
      if (res.ok) {
        setSms({ activationId: d.activationId, phoneNumber: d.phoneNumber, otp: null, status: "waiting" });
        setElapsed(0);
        startPolling(d.activationId);
        toast.success(`Number assigned: ${d.phoneNumber}`);
      } else {
        toast.error(d.message ?? "Failed to get number.");
      }
    } catch {
      toast.error("Failed to get number.");
    } finally {
      setSmsLoading(false);
    }
  }

  async function cancelNumber() {
    if (!sms) return;
    stopPolling();
    await cancelCurrentNumber(sms.activationId);
    toast.success("Number cancelled.");
  }

  function startEmailOtpPolling() {
    if (!activeEmailId) { toast.error("Select an email first."); return; }
    const email = emails.find((e) => e.id === activeEmailId);
    if (!email) return;
    startEmailPolling(email.emailAddress);
    toast.success("Polling inbox for email OTP...");
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

  // ── Copy helper ────────────────────────────────────────────────────────────

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${label}`));
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
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950">
      {/* Header */}
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/pools" className="text-xs text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400">
              ← Pools
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <h1 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-white">
              Generate CBTL Account
            </h1>
          </div>
          <ThemeToggle />
        </div>

        {/* Stats bar */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">HeroSMS Balance</p>
            <p className="mt-1 text-xl font-bold text-cyan-600 dark:text-cyan-400">
              {balance !== null ? `$${balance}` : "—"}
            </p>
            <button
              onClick={fetchBalance}
              disabled={balanceLoading}
              className="mt-1 text-xs text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
            >
              {balanceLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Disabled Emails</p>
            <p className="mt-1 text-xl font-bold text-red-500 dark:text-red-400">{emails.length}</p>
            <button
              onClick={fetchEmails}
              disabled={emailsLoading}
              className="mt-1 text-xs text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
            >
              {emailsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Done This Session</p>
            <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{completed.length}</p>
          </div>
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
                    className={`flex cursor-pointer items-center justify-between border-b border-slate-100 px-4 py-2.5 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                      activeEmailId === row.id ? "bg-cyan-50 dark:bg-cyan-900/20" : ""
                    }`}
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
                      if (emailOtpStatus === "idle") startEmailPolling(activeEmail.emailAddress);
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
                    ? `Checking inbox for email to ${activeEmail?.emailAddress ?? "..."}`
                    : "Not started — click below after submitting phone OTP in the CBTL app"}
                </p>
              )}
              <button
                onClick={startEmailOtpPolling}
                disabled={!activeEmailId || emailOtpStatus === "polling" || emailOtpStatus === "success"}
                className="mt-1 w-full border border-violet-400 py-2 text-xs font-semibold text-violet-600 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-violet-500 dark:text-violet-400 dark:hover:bg-violet-950"
              >
                {emailOtpStatus === "polling" ? "Polling inbox..." : emailOtpStatus === "success" ? "✓ Email OTP received" : "Start Polling Email OTP"}
              </button>
            </div>

            {/* Phone number */}
            <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone Number</p>
                {sms?.status === "waiting" && (
                  <span className="text-xs text-slate-400">
                    {elapsed}s / {MAX_POLL_SECONDS}s
                  </span>
                )}
              </div>

              {sms ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">
                      {sms.phoneNumber}
                    </span>
                    <button
                      onClick={() => copy(sms.phoneNumber, "phone number")}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-400 dark:hover:text-cyan-400"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                      sms.status === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : sms.status === "cancelled"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}>
                      {sms.status === "waiting" ? "Waiting for OTP..." : sms.status}
                    </span>
                    <button
                      onClick={cancelNumber}
                      className="text-xs text-red-500 hover:text-red-400"
                    >
                      Cancel & get new number
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No number assigned yet.</p>
              )}

              <button
                onClick={requestNumber}
                disabled={!activeEmailId || smsLoading}
                className="mt-3 w-full border border-cyan-500 py-2 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-950"
              >
                {smsLoading ? "Requesting..." : sms ? "Request New Number" : "Get Phone Number"}
              </button>
            </div>

            {/* SMS OTP */}
            <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">SMS OTP</p>
              {sms?.otp ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                    {sms.otp}
                  </span>
                  <button
                    onClick={() => copy(sms.otp!, "SMS OTP")}
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-400 dark:hover:text-cyan-400"
                  >
                    Copy
                  </button>
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
              {activating ? "Activating..." : "✓ Mark as Done — Set Available (+14 day expiry)"}
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
