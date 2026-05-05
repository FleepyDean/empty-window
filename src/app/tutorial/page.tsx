"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PRODUCT_CATALOG, ProductConfig } from "@/lib/products";
import { ThemeToggle } from "@/components/theme";

type TutorialEntry = {
  key: string;
  name: string;
  tutorialSteps: string[];
  tutorialVideoUrl: string | null;
  redemptionInstructions: string;
};

const DEFAULT_STEPS: Record<string, string[]> = {
  zus: [
    "Open the ZUS Coffee app and make sure you are logged out.",
    "Tap 'Register' and insert the phone number provided to you.",
    "Select 'Send SMS' — NOT WhatsApp — to receive the OTP.",
    "Enter a random name, email, and set Date of Birth to tomorrow's date.",
    "Skip the referral section — do NOT enter any referral code.",
    "After logging in, go to Account → My Vouchers → Enter 'BUY1FREE1' and claim.",
    "Enable Biometric Login in app settings so you can log in again if needed.",
  ],
  chagee: [
    "Open the Chagee app and make sure you are logged out.",
    "Tap 'Register' and insert the phone number provided to you.",
    "Wait for the OTP SMS and enter it in the app.",
    "Enter a random name and email. Set Date of Birth to tomorrow's date.",
    "Skip the referral section — do NOT enter any referral code.",
    "After logging in, go to Me → My Account to view your vouchers.",
  ],
  tealive: [
    "Open the Tealive app and make sure you are logged out.",
    "Tap 'Register' and insert the phone number provided to you.",
    "Wait for the OTP SMS and enter it in the app.",
    "Enter a random name and email. Skip any referral code section.",
    "After logging in, go to Reward → My Vouchers to view your vouchers.",
  ],
  kfc: [
    "Open the KFC app and make sure you are logged out.",
    "Tap 'Register' and insert the phone number provided to you.",
    "Wait for the OTP SMS and enter it in the app.",
    "Enter a random name and email.",
    "Enter referral code 'W4PQJETW' for an RM8 bonus.",
    "After logging in, go to Order Now → Offers & Rewards to view your vouchers.",
  ],
  cbtl: [
    "Open the MyCBTL app and make sure you are logged out.",
    "Enter a random name and a valid email address.",
    "Verify your email with the OTP sent to it.",
    "Insert the phone number provided to you and wait for the OTP.",
    "Skip the referral section — do NOT enter any referral code.",
    "After logging in, go to Home → View My Vouchers to view your vouchers.",
  ],
  gigi: [
    "Open the Gigi Coffee app and make sure you are logged out.",
    "Tap 'Register' and insert the phone number provided to you.",
    "Wait for the OTP SMS and enter it in the app.",
    "Enter a random name and email. Skip any referral code section.",
    "After logging in, go to Home → 1 Voucher to view your vouchers.",
  ],
};

function sanitizeVideoUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Handle youtube.com/watch?v=ID or youtu.be/ID — convert to embed
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      if (u.pathname.startsWith("/embed/")) {
        // Already embed — just switch to nocookie
        const clean = new URL(url.replace("youtube.com", "youtube-nocookie.com"));
        clean.searchParams.set("rel", "0");
        clean.searchParams.set("modestbranding", "1");
        return clean.toString();
      }
      const videoId = u.searchParams.get("v");
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
    }
    if (u.hostname === "youtu.be") {
      const videoId = u.pathname.slice(1);
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
    }
    if (u.hostname === "www.youtube-nocookie.com" || u.hostname === "youtube-nocookie.com") {
      u.searchParams.set("rel", "0");
      u.searchParams.set("modestbranding", "1");
      return u.toString();
    }
  } catch { /* not a valid URL, return as-is */ }
  return url;
}

export default function TutorialPage() {
  const [selected, setSelected] = useState<string>(PRODUCT_CATALOG[0].key);
  const [tutorials, setTutorials] = useState<TutorialEntry[]>([]);

  useEffect(() => {
    fetch("/api/products/content")
      .then((r) => r.json())
      .then((d) => { if (d.products) setTutorials(d.products); })
      .catch(() => {});
  }, []);

  const product = PRODUCT_CATALOG.find((p) => p.key === selected) as ProductConfig;
  const tutorial = tutorials.find((t) => t.key === selected);
  const steps = tutorial?.tutorialSteps?.length ? tutorial.tutorialSteps : (DEFAULT_STEPS[selected] ?? []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <section className="border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900/80">

        {/* Header */}
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">Nishinae Store</p>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:bg-violet-950 dark:hover:text-violet-400"
            >
              ← Store
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">Redemption Tutorials</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Step-by-step guides on how to redeem your voucher for each brand.
        </p>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row">

          {/* Sidebar */}
          <aside className="w-full shrink-0 sm:w-48">
            <ul className="space-y-1">
              {PRODUCT_CATALOG.map((p) => (
                <li key={p.key}>
                  <button
                    onClick={() => setSelected(p.key)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium transition ${
                      selected === p.key
                        ? "border-l-2 border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                        : "border-l-2 border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <img
                      src={p.logoUrl}
                      alt={p.name}
                      className="h-7 w-7 shrink-0 object-contain bg-white p-0.5"
                    />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Product title */}
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
              <img
                src={product.logoUrl}
                alt={product.name}
                className="h-10 w-10 object-contain bg-white p-1"
              />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{product.name} Tutorial</h2>
            </div>

            {/* Video */}
            <div className="mt-5">
              {tutorial?.tutorialVideoUrl ? (
                <div className="aspect-video w-full overflow-hidden border border-slate-200 bg-black dark:border-slate-700">
                  <iframe
                    src={sanitizeVideoUrl(tutorial.tutorialVideoUrl!)}
                    title={`${product.name} tutorial`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-slate-400 dark:text-slate-600"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">Tutorial video coming soon</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Follow the written steps below in the meantime</p>
                  </div>
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Step-by-Step Guide</h3>
              <ol className="mt-3 space-y-3">
                {steps.map((step: string, i: number) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-violet-500 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            {/* Warning */}
            <div className="mt-6 border-l-4 border-amber-400 bg-amber-50 p-4 dark:bg-amber-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Important</p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Do not log into any other account with the number provided — it will be burned after 15 minutes.
                Follow all steps carefully. We are not responsible for errors caused by not following the instructions.
              </p>
            </div>

            {/* CTA */}
            <div className="mt-6 flex gap-3">
              <Link
                href="/redeem"
                className="inline-flex bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 dark:text-slate-950 dark:hover:bg-cyan-400"
              >
                Go to Redeem →
              </Link>
              <Link
                href="/"
                className="inline-flex border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Back to Store
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
