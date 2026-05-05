"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme";
import { PRODUCT_MAP, ProductConfig, isProductKey } from "@/lib/products";
import { toast } from "sonner";

type OrderDetailsResponse = {
  valid: boolean;
  orderId: string;
  status: string;
  isCartOrder: boolean;
  products: OrderProduct[];
  claims: ClaimHistoryItem[];
  totalRemaining: number;
  message: string;
};

type OrderProduct = {
  itemId: number | null;
  productKey: string;
  productName: string;
  serviceCode: string;
  heroServiceCode: string;
  totalQuantity: number;
  remainingQty: number;
  canClaim: boolean;
  logoUrl: string;
};

type ClaimHistoryItem = {
  claimId: string;
  productKey: string;
  productName: string;
  phoneNumber: string;
  otp: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
};

type ClaimState = "idle" | "claiming" | "waiting_otp" | "success" | "cancelled" | "expired";
type ActiveClaim = {
  claimId: string;
  phoneNumber: string;
  productName: string;
  productKey: string;
  expiresAt: number;
};

const OTP_POLL_INTERVAL_MS = 5000;
const CLAIM_DURATION_MS = 15 * 60 * 1000;
const ACTIVE_CLAIM_ID_KEY = "nishinae.activeClaimId";

function RedeemPageContent() {
  const searchParams = useSearchParams();
  const [orderIdInput, setOrderIdInput] = useState(searchParams.get("orderId") ?? "");
  const [orderDetails, setOrderDetails] = useState<OrderDetailsResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "activations">("products");

  const [infoModalProduct, setInfoModalProduct] = useState<ProductConfig | null>(null);

  // Active claim state (for current claiming session)
  const [activeClaim, setActiveClaim] = useState<ActiveClaim | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [otp, setOtp] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [claimStartTime, setClaimStartTime] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [claimingProduct, setClaimingProduct] = useState<OrderProduct | null>(null);

  const CANCEL_COOLDOWN_MS = 2 * 60 * 1000;
  const cancelElapsedMs = claimStartTime ? nowMs - claimStartTime : 0;
  const withinCooldown = cancelElapsedMs < CANCEL_COOLDOWN_MS;
  const cancelCooldownSecsLeft = claimStartTime
    ? Math.max(0, Math.ceil((CANCEL_COOLDOWN_MS - cancelElapsedMs) / 1000))
    : 120;
  const cancelCooldownLabel = `${Math.floor(cancelCooldownSecsLeft / 60).toString().padStart(2, "0")}:${(cancelCooldownSecsLeft % 60).toString().padStart(2, "0")}`;

  function setActiveClaimId(claimIdValue: string) {
    localStorage.setItem(ACTIVE_CLAIM_ID_KEY, claimIdValue);
  }

  function clearActiveClaimId() {
    localStorage.removeItem(ACTIVE_CLAIM_ID_KEY);
  }

  useEffect(() => {
    if (claimState !== "waiting_otp" || !claimStartTime) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [claimState, claimStartTime]);

  const countdownLabel = useMemo(() => {
    const safeMs = Math.max(timeLeftMs, 0);
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [timeLeftMs]);

  async function validateOrder(event: FormEvent) {
    event.preventDefault();
    setIsValidating(true);

    try {
      const response = await fetch("/api/orders/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderIdInput.trim() })
      });
      const data = (await response.json()) as OrderDetailsResponse;

      if (!response.ok || !data.valid) {
        setOrderDetails(null);
        toast.error(data.message ?? "Invalid order ID.");
        return;
      }

      setOrderDetails(data);
      setActiveTab("products");
      setClaimState("idle");
      setActiveClaim(null);
      setOtp(null);
      setExpiresAt(null);
      setTimeLeftMs(0);
      clearActiveClaimId();
      toast.success(`Order validated. ${data.products.length} product(s) found.`);
    } catch {
      toast.error("Could not validate order. Try again.");
    } finally {
      setIsValidating(false);
    }
  }

  async function startClaim(product: OrderProduct) {
    if (!orderDetails) return;

    setClaimingProduct(product);
    setClaimState("claiming");
    setOtp(null);

    try {
      const response = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderDetails.orderId,
          orderItemId: product.itemId
        })
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message ?? "Unable to claim number.");
        setClaimState("idle");
        setClaimingProduct(null);
        return;
      }

      setActiveClaim({
        claimId: data.claimId,
        phoneNumber: data.phoneNumber,
        productName: product.productName,
        productKey: product.productKey,
        expiresAt: data.expiresAt ?? Date.now() + CLAIM_DURATION_MS
      });
      setExpiresAt(data.expiresAt ?? Date.now() + CLAIM_DURATION_MS);
      setTimeLeftMs((data.expiresAt ?? Date.now() + CLAIM_DURATION_MS) - Date.now());
      setClaimState("waiting_otp");
      setClaimStartTime(Date.now());
      setActiveClaimId(data.claimId);
      toast.success(`Number claimed for ${product.productName}. Waiting for OTP.`);
    } catch {
      toast.error("Claim failed. Please retry.");
      setClaimState("idle");
      setClaimingProduct(null);
    }
  }

  const cancelClaim = useCallback(async (reason: "cancelled" | "expired") => {
    if (!activeClaim?.claimId) return;

    try {
      const response = await fetch("/api/claim/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: activeClaim.claimId, reason })
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message ?? "Unable to cancel claim.");
        return;
      }

      setClaimState(reason === "expired" ? "expired" : "cancelled");
      setActiveClaim(null);
      setExpiresAt(null);
      setTimeLeftMs(0);
      setOtp(null);
      setClaimingProduct(null);
      clearActiveClaimId();
      toast.message(data.message);
    } catch {
      toast.error("Cancellation failed. Try again.");
    }
  }, [activeClaim]);

  useEffect(() => {
    if (claimState !== "waiting_otp" || !activeClaim || !expiresAt) return;

    const interval = setInterval(() => {
      const nextLeft = expiresAt - Date.now();
      setTimeLeftMs(nextLeft);
      if (nextLeft <= 0) {
        clearInterval(interval);
        cancelClaim("expired");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cancelClaim, claimState, activeClaim, expiresAt]);

  useEffect(() => {
    if (claimState !== "waiting_otp" || !activeClaim) return;

    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/claim/otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimId: activeClaim.claimId })
        });
        const data = await response.json();

        if (!response.ok) return;

        if (data.status === "success" && data.otp) {
          setOtp(data.otp);
          setClaimState("success");
          setActiveClaim((prev) => prev ? { ...prev } : null);
          setTimeLeftMs(0);
          setExpiresAt(null);
          clearActiveClaimId();
          toast.success("OTP received.");
          clearInterval(poll);
          return;
        }

        if (data.status === "cancelled" || data.status === "expired") {
          setClaimState(data.status);
          setActiveClaim(null);
          setExpiresAt(null);
          setTimeLeftMs(0);
          clearActiveClaimId();
          clearInterval(poll);
        }
      } catch {
        // Fail silently for transient poll errors.
      }
    }, OTP_POLL_INTERVAL_MS);

    return () => clearInterval(poll);
  }, [claimState, activeClaim]);

  // Restore active claim on page load
  useEffect(() => {
    const savedClaimId = localStorage.getItem(ACTIVE_CLAIM_ID_KEY);
    if (!savedClaimId) return;

    const restoreSession = async () => {
      try {
        const response = await fetch("/api/claim/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimId: savedClaimId })
        });

        if (!response.ok) {
          clearActiveClaimId();
          return;
        }

        const data = await response.json();
        if (data.status === "waiting_otp") {
          setActiveClaim({
            claimId: data.claimId,
            phoneNumber: data.phoneNumber,
            productName: data.productName || "Product",
            productKey: "unknown",
            expiresAt: data.expiresAt
          });
          setExpiresAt(data.expiresAt);
          setTimeLeftMs(data.expiresAt - Date.now());
          setClaimState("waiting_otp");
        } else if (data.status === "success") {
          setOtp(data.otp);
          setClaimState("success");
          clearActiveClaimId();
        } else {
          setClaimState(data.status);
          clearActiveClaimId();
        }
      } catch {
        clearActiveClaimId();
      }
    };

    void restoreSession();
  }, []);

  // Refresh order details after successful claim
  useEffect(() => {
    if (claimState === "success" && orderDetails) {
      // Refresh order details to show updated quantities
      fetch("/api/orders/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderDetails.orderId })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.valid) setOrderDetails(data);
        })
        .catch(() => {});
    }
  }, [claimState, orderDetails?.orderId]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <section className="border border-slate-200 bg-white p-6 sm:p-9 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">nishinae store</p>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-sm text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300">
              Back
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">Redeem Order</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Enter order ID to view products and claim numbers.
        </p>

        <form onSubmit={validateOrder} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            value={orderIdInput}
            onChange={(event) => setOrderIdInput(event.target.value)}
            placeholder="Enter Order ID"
            className="w-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={isValidating}
            className="bg-cyan-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-950 dark:hover:bg-cyan-400"
          >
            {isValidating ? "Validating..." : "Validate"}
          </button>
        </form>

        {/* Tabs */}
        {orderDetails && (
          <div className="mt-6">
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab("products")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "products"
                    ? "border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                }`}
              >
                Products ({orderDetails.products.length})
              </button>
              <button
                onClick={() => setActiveTab("activations")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "activations"
                    ? "border-b-2 border-cyan-500 text-cyan-600 dark:text-cyan-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                }`}
              >
                Activations ({orderDetails.claims.length})
              </button>
            </div>

            {/* Products Tab */}
            {activeTab === "products" && (
              <div className="mt-4 space-y-4">
                {orderDetails.products.map((product) => (
                  <div
                    key={product.productKey + product.itemId}
                    className="flex items-center gap-4 border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <img
                      src={product.logoUrl}
                      alt={product.productName}
                      className="h-12 w-12 object-contain bg-white p-1"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{product.productName}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {product.remainingQty} of {product.totalQuantity} remaining
                      </p>
                    </div>

                    {activeClaim && claimingProduct?.productKey === product.productKey ? (
                      <div className="flex items-center gap-2">
                        {claimState === "waiting_otp" && (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-amber-600 dark:text-amber-400">Waiting for OTP...</p>
                              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{countdownLabel}</p>
                            </div>
                            <button
                              onClick={() => cancelClaim("cancelled")}
                              className="border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {claimState === "success" && otp && (
                          <div className="text-right">
                            <p className="text-xs text-cyan-600 dark:text-cyan-400">OTP Received</p>
                            <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{otp}</p>
                          </div>
                        )}
                        {claimState === "cancelled" && (
                          <span className="text-sm text-red-600 dark:text-red-400">Cancelled</span>
                        )}
                        {claimState === "claiming" && (
                          <span className="text-sm text-slate-500">Claiming...</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setInfoModalProduct(PRODUCT_MAP[product.productKey as keyof typeof PRODUCT_MAP])}
                          className="p-2 text-slate-400 transition hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400"
                          title="View redemption info"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        </button>
                        <button
                          onClick={() => startClaim(product)}
                          disabled={!product.canClaim || claimState === "claiming" || claimState === "waiting_otp"}
                          className="bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-950 dark:hover:bg-cyan-400"
                        >
                          {claimState === "claiming" && claimingProduct?.productKey === product.productKey
                            ? "Claiming..."
                            : product.canClaim
                              ? "Get Number"
                              : "0 left"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* Active Claim Display */}
                <AnimatePresence>
                  {activeClaim && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border-l-4 border-violet-500 bg-slate-100 p-4 dark:bg-slate-800/50"
                    >
                      <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">
                        {activeClaim.productName} - Claimed Number
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeClaim.phoneNumber?.replace(/^60?/, "")}</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(activeClaim.phoneNumber?.replace(/^60?/, "") ?? "")}
                          className="p-2 text-slate-400 transition hover:text-cyan-600"
                          title="Copy number"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                      </div>

                      {claimState === "waiting_otp" && (
                        <div className="mt-3 border-l-2 border-amber-500 bg-white p-3 dark:bg-slate-900">
                          <p className="text-xs text-slate-500">• Please remain on this page until the OTP appears.</p>
                          <p className="text-xs text-slate-500">• If you are not able to get the OTP in 5 mins, click Cancel button and generate a new one.</p>
                          {withinCooldown && (
                            <p className="mt-1 text-xs text-amber-600">⚠️ You can only cancel after 2 minutes</p>
                          )}
                        </div>
                      )}

                      {claimState === "success" && otp && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-3 border-l-4 border-cyan-500 bg-white p-3 dark:bg-slate-900"
                        >
                          <p className="text-xs uppercase tracking-widest text-cyan-600 dark:text-cyan-400">OTP</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{otp}</p>
                            <button
                              onClick={() => navigator.clipboard.writeText(otp)}
                              className="p-2 text-slate-400 transition hover:text-cyan-600"
                              title="Copy OTP"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Activations Tab */}
            {activeTab === "activations" && (
              <div className="mt-4 space-y-3">
                {orderDetails.claims.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No activations yet. Claim a number to see it here.
                  </p>
                ) : (
                  orderDetails.claims.map((claim) => (
                    <div
                      key={claim.claimId}
                      className="flex items-center gap-4 border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <img
                        src={getLogoUrl(claim.productKey)}
                        alt={claim.productName}
                        className="h-10 w-10 object-contain bg-white p-1"
                      />
                      <div className="flex-1">
                        <h3 className="font-medium text-slate-900 dark:text-white">{claim.productName}</h3>
                        <p className="text-sm font-mono text-slate-600 dark:text-slate-400">{claim.phoneNumber}</p>
                      </div>
                      <div className="text-right">
                        {claim.status === "success" && claim.otp ? (
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{claim.otp}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(claim.otp!)}
                              className="p-1.5 text-slate-400 transition hover:text-cyan-600"
                              title="Copy OTP"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        ) : claim.status === "cancelled" ? (
                          <span className="text-sm text-red-600 dark:text-red-400">Cancelled</span>
                        ) : claim.status === "expired" ? (
                          <span className="text-sm text-slate-500">Expired</span>
                        ) : (
                          <span className="text-sm text-amber-600 dark:text-amber-400">Waiting...</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {infoModalProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setInfoModalProduct(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto border-2 border-violet-500 bg-white p-6 shadow-2xl shadow-violet-500/20 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <img
                src={infoModalProduct.logoUrl}
                alt={infoModalProduct.name}
                className="h-8 w-8 object-contain bg-white p-1"
              />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{infoModalProduct.name} - Redemption Info</h3>
              <button
                onClick={() => setInfoModalProduct(null)}
                className="ml-auto p-1.5 text-slate-500 transition hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {infoModalProduct.redemptionInstructions}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function getLogoUrl(productKey: string): string {
  const logos: Record<string, string> = {
    zus: "https://resources.wobbjobs.com/jobs-malaysia/companies/2cced996-255d-4525-812b-e9319b8ce8f2/company_logo/original/13f90cff-059d-435e-b166-794a51360600-logo.jpg",
    chagee: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT5oclmn4Q6h0t7hgLN8_S2N7QzrlczmdW0rw&s",
    tealive: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEaSAISBahRRXbolEAdKw2fFKL6sqd0pOKyg&s",
    kfc: "https://media.tenor.com/kkb548hIQfUAAAAe/kfc-logo.png",
    cbtl: "https://play-lh.googleusercontent.com/Qmm4QXPiOycGYwkaF9QFX1qxZKdMYHp-Ff8x7meL_T_ExwRyOb0An4WYkt53eN_Itg",
    gigi: "https://www.gigicoffee.com/wp-content/uploads/2023/04/logo-gigicoffee.png"
  };
  return logos[productKey] || "";
}

export default function RedeemPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-slate-500">Loading...</div></div>}>
      <RedeemPageContent />
    </Suspense>
  );
}
