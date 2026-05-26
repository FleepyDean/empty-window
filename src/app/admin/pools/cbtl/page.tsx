"use client";

import { useEffect, useRef, useState } from "react";
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
  const [editField, setEditField] = useState<'status' | 'expiry' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const lastClickedIdx = useRef<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmails, setNewEmails] = useState("");
  const [adding, setAdding] = useState(false);

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

  function startEmailEdit(row: EmailAccountRow, field: 'status' | 'expiry') {
    setEditingEmailId(row.id);
    setEditField(field);
    setEditEmailStatus(row.status);
    setEditEmailExpiry(row.voucherExpiresAt ? row.voucherExpiresAt.split("T")[0] : "");
  }

  async function saveEmailEdit(id: number, status?: string, expiry?: string) {
    const resolvedStatus = status ?? editEmailStatus;
    const resolvedExpiry = (expiry ?? editEmailExpiry) || null;
    // Optimistic update — patch local state immediately, no refetch
    setEmailAccounts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: resolvedStatus, voucherExpiresAt: resolvedExpiry }
          : a
      )
    );
    setEditingEmailId(null);
    try {
      const res = await fetch("/api/admin/email-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: resolvedStatus, voucherExpiresAt: resolvedExpiry })
      });
      if (res.ok) {
        toast.success("Updated.");
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to update.");
        // Revert by refetching only on failure
        await fetchEmailAccounts();
      }
    } catch {
      toast.error("Failed to update.");
      await fetchEmailAccounts();
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

  function toggleSelect(id: number, e: React.MouseEvent) {
    const sortedAccounts = [...emailAccounts].sort((a, b) => {
      const order = { available: 0, disabled: 1, used: 2 };
      return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
    });
    const currentIdx = sortedAccounts.findIndex((a) => a.id === id);

    if (e.shiftKey && lastClickedIdx.current !== null && lastClickedIdx.current !== currentIdx) {
      const start = Math.min(lastClickedIdx.current, currentIdx);
      const end = Math.max(lastClickedIdx.current, currentIdx);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(sortedAccounts[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    lastClickedIdx.current = currentIdx;
  }

  function toggleSelectAll() {
    if (selectedIds.size === emailAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emailAccounts.map((a) => a.id)));
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected email account(s)?`)) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch("/api/admin/email-accounts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });
        if (res.ok) deleted++;
      } catch { /* ignore */ }
    }
    toast.success(`Deleted ${deleted} of ${selectedIds.size} accounts.`);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    await fetchEmailAccounts();
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

      {/* Add Emails */}
      <div className="mt-4">
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          {showAddForm ? "Hide" : "+ Add Emails"}
        </button>
        {showAddForm && (
          <div className="mt-2 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs text-slate-500">Paste emails (one per line). They will be added as <strong>disabled</strong>.</p>
            <textarea
              value={newEmails}
              onChange={(e) => setNewEmails(e.target.value)}
              rows={5}
              className="w-full border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            />
            <button
              onClick={async () => {
                const emails = newEmails.split("\n").map((l) => l.trim()).filter(Boolean);
                if (emails.length === 0) { toast.error("Enter at least one email."); return; }
                setAdding(true);
                try {
                  const res = await fetch("/api/admin/email-accounts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emails })
                  });
                  const d = await res.json();
                  if (res.ok) {
                    toast.success(`Added ${d.count} email(s).`);
                    setNewEmails("");
                    setShowAddForm(false);
                    await fetchEmailAccounts();
                  } else {
                    toast.error(d.message ?? "Failed to add.");
                  }
                } catch {
                  toast.error("Failed to add.");
                } finally {
                  setAdding(false);
                }
              }}
              disabled={adding}
              className="mt-2 border border-violet-400 px-4 py-1.5 text-xs font-semibold text-violet-600 transition hover:bg-violet-50 disabled:opacity-40 dark:border-violet-500 dark:text-violet-400 dark:hover:bg-violet-950"
            >
              {adding ? "Adding..." : "Add Emails"}
            </button>
          </div>
        )}
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
        {selectedIds.size > 0 && (
          <button
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-40 dark:border-red-700 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
          >
            {bulkDeleting ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={emailAccounts.length > 0 && selectedIds.size === emailAccounts.length}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-red-500"
                  />
                </th>
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
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>
              ) : emailAccounts.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No email accounts. Click Refresh to load.</td></tr>
              ) : (
                [...emailAccounts].sort((a, b) => {
                  const order = { available: 0, disabled: 1, used: 2 };
                  return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
                }).map((row) => {
                  const isExpired = row.voucherExpiresAt && new Date(row.voucherExpiresAt) < new Date();
                  const expiresIn = row.voucherExpiresAt
                    ? Math.ceil((new Date(row.voucherExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  return (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onClick={(e) => toggleSelect(row.id, e)}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 cursor-pointer accent-red-500"
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{row.emailAddress}</td>
                      <td className="px-4 py-2">
                        {editingEmailId === row.id && editField === 'status' ? (
                          <select
                            value={editEmailStatus}
                            onChange={(e) => {
                              setEditEmailStatus(e.target.value);
                              saveEmailEdit(row.id, e.target.value, editEmailExpiry);
                            }}
                            onBlur={() => setEditingEmailId(null)}
                            className="border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                            autoFocus
                          >
                            <option value="available">available</option>
                            <option value="used">used</option>
                            <option value="disabled">disabled</option>
                          </select>
                        ) : (
                          <span
                            onClick={() => startEmailEdit(row, 'status')}
                            className={`inline-block cursor-pointer px-1.5 py-0.5 text-xs hover:opacity-80 ${
                              row.status === "available"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : row.status === "used"
                                ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                : "bg-red-500/10 text-red-600 dark:text-red-400"
                            }`}>{row.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {editingEmailId === row.id && editField === 'expiry' ? (
                          <input
                            type="date"
                            value={editEmailExpiry}
                            onChange={(e) => {
                              setEditEmailExpiry(e.target.value);
                              saveEmailEdit(row.id, editEmailStatus, e.target.value);
                            }}
                            onBlur={() => setEditingEmailId(null)}
                            className="border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                            autoFocus
                          />
                        ) : row.voucherExpiresAt ? (
                          <span
                            onClick={() => startEmailEdit(row, 'expiry')}
                            className={`cursor-pointer text-xs hover:opacity-80 ${isExpired ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}
                          >
                            {new Date(row.voucherExpiresAt).toLocaleDateString()}
                            {expiresIn !== null && (
                              <span className={isExpired ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}>
                                {" "}({isExpired ? "expired" : `${expiresIn}d`})
                              </span>
                            )}
                          </span>
                        ) : (
                          <input
                            type="date"
                            onFocus={() => startEmailEdit(row, 'expiry')}
                            onClick={() => startEmailEdit(row, 'expiry')}
                            readOnly
                            placeholder="Set expiry"
                            className="w-32 cursor-pointer border border-slate-200 bg-transparent px-2 py-1 text-xs text-slate-400 hover:border-slate-400 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-500"
                          />
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
                        <button
                          onClick={() => deleteEmailAccount(row.id, row.emailAddress)}
                          className="text-xs text-red-500 hover:text-red-400"
                        >
                          Delete
                        </button>
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
