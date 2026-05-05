"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

export default function CheckoutFailedPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <section className="border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-widest text-red-600 dark:text-red-400">
            Payment Failed
          </p>
          <ThemeToggle />
        </div>

        <div className="mt-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">
            Payment Unsuccessful
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            We couldn&apos;t process your payment. Please try again or contact support if the issue persists.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center bg-cyan-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600 dark:text-slate-950"
            >
              Try Again
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Back to Store
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
