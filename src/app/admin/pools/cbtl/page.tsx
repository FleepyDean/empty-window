"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

type EmailAccountRow = {
  id: number;
  emailAddress: string;
  status: string;
  claimId: string | null;
  assignedAt: string | null;
  voucherExpiresAt: string | null;
  createdAt: string;
  claim: { claimId: string; status: string; emailOtp: string | null; createdAt: string } | null;
};

export default function CbtlPoolPage() {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountRow[]>([]);
  const [emailAccountsLoading, setEmailAccountsLoading] = useState(false);
  const [editingEmailId, setEditingEmailId] = useState<number | null>(null);
  const [editEmailExpiry, setEditEmailExpiry] = useState("");
  const [editEmailStatus, setEditEmailStatus] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  async function fetchEmailAccounts() {
    setEmailAccountsLoading(true);
    try {
      const res = await fetch("/api/admin/email-accounts");
      const data = await res.json();
      if (res.ok) setEmailAccounts(data.accounts);
      else toast.error(data.message ?? "Failed to fetch email accounts.");
    } catch {
      toast.error("Failed to fetch email accounts.");
    } finally {
      setEmailAccountsLoading(false);
    }
  }

  function startEmailEdit(row: EmailAccountRow) {
    setEditingEmailId(row.id);
    setEditEmailStatus(row.status);
    setEditEmailExpiry(row.voucherExpiresAt ? row.voucherExpiresAt.split("T")[0] : "");
  }

  async function saveEmailEdit(id: number) {
    setSavingEmail(true);
    try {
      const res = await fetch("/api/admin/email-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: editEmailStatus,
          voucherExpiresAt: editEmailExpiry || null
        })
      });
      if (res.ok) {
        toast.success("Updated.");
        setEditingEmailId(null);
        await fetchEmailAccounts();
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to update.");
      }
    } catch {
      toast.error("Failed to update.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function deleteEmailAccount(id: number, email: string) {
    if (!confirm(`Delete email account ${email}?`)) return;
    try {
      const res = await fetch("/api/admin/email-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        toast.success("Deleted.");
        await fetchEmailAccounts();
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to delete.");
      }
    } catch {
      toast.error("Failed to delete.");
    }
  }

  useEffect(() => {
    fetchEmailAccounts();
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">nishinae store</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">CBTL Email Pool</h1>
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

      {/* Pool Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {emailAccounts.filter((a) => a.status === "available").length}
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Used</p>
          <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">
            {emailAccounts.filter((a) => a.status === "used").length}
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{emailAccounts.length}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={fetchEmailAccounts}
          disabled={emailAccountsLoading}
          className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
        >
          {emailAccountsLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Table */}
      <div className="mt-4 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Email</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Voucher Expiry</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Claim</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Email OTP</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Assigned</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {emailAccountsLoading ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>
              ) : emailAccounts.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No email accounts. Click Refresh to load.</td></tr>
              ) : (
                emailAccounts.map((row) => {
                  const isExpired = row.voucherExpiresAt && new Date(row.voucherExpiresAt) < new Date();
                  const expiresIn = row.voucherExpiresAt
                    ? Math.ceil((new Date(row.voucherExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  return (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{row.emailAddress}</td>
                      <td className="px-4 py-2">
                        {editingEmailId === row.id ? (
                          <select
                            value={editEmailStatus}
                            onChange={(e) => setEditEmailStatus(e.target.value)}
                            className="border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                          >
                            <option value="available">available</option>
                            <option value="used">used</option>
                            <option value="disabled">disabled</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-1.5 py-0.5 text-xs ${
                            row.status === "available"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : row.status === "used"
                              ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400"
                          }`}>{row.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {editingEmailId === row.id ? (
                          <input
                            type="date"
                            value={editEmailExpiry}
                            onChange={(e) => setEditEmailExpiry(e.target.value)}
                            className="border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                          />
                        ) : row.voucherExpiresAt ? (
                          <span className={`text-xs ${isExpired ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
                            {new Date(row.voucherExpiresAt).toLocaleDateString()}
                            {expiresIn !== null && (
                              <span className={isExpired ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}>
                                {" "}({isExpired ? "expired" : `${expiresIn}d`})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {row.claim ? (
                          <span className={`inline-block px-1.5 py-0.5 text-xs ${
                            row.claim.status === "success"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                          }`}>{row.claim.status}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.claim?.emailOtp ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{row.claim.emailOtp}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {row.assignedAt ? new Date(row.assignedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {editingEmailId === row.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEmailEdit(row.id)}
                              disabled={savingEmail}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-500 disabled:opacity-50 dark:text-emerald-400"
                            >
                              {savingEmail ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingEmailId(null)}
                              className="text-xs text-slate-500 hover:text-slate-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEmailEdit(row)}
                              className="text-xs text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteEmailAccount(row.id, row.emailAddress)}
                              className="text-xs text-red-500 hover:text-red-400"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
