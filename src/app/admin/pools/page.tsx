"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

export default function PoolsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">nishinae store</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Account Pools</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/admin"
            className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Admin Dashboard
          </Link>
        </div>
      </div>

      {/* Pool Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* CBTL Email Pool */}
        <Link
          href="/admin/pools/cbtl"
          className="group border border-slate-200 bg-white p-6 transition hover:border-cyan-500 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-400"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">CBTL Email Pool</h2>
            <span className="text-cyan-600 transition group-hover:translate-x-1 dark:text-cyan-400">→</span>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manage Coffee Bean & Tea Leaf email accounts for redemption
          </p>
          <p className="mt-4 text-xs text-slate-400">Click to manage →</p>
        </Link>

        {/* Luckin Coffee Account Pool */}
        <Link
          href="/admin/pools/luckin"
          className="group border border-slate-200 bg-white p-6 transition hover:border-cyan-500 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-400"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Luckin Coffee Pool</h2>
            <span className="text-cyan-600 transition group-hover:translate-x-1 dark:text-cyan-400">→</span>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manage Luckin Coffee account credentials for redemption
          </p>
          <p className="mt-4 text-xs text-slate-400">Click to manage →</p>
        </Link>
      </div>

      {/* Import Instructions */}
      <div className="mt-8 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bulk Import</h3>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Use the import scripts to add accounts in bulk:
        </p>
        <div className="mt-3 space-y-1 font-mono text-xs text-slate-600 dark:text-slate-400">
          <p>node scripts/import-emails.mjs emails.csv</p>
          <p>node scripts/import-luckin-accounts.mjs accounts.csv</p>
        </div>
      </div>
    </main>
  );
}
