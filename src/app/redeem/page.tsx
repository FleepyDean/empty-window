"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
  productType: "otp" | "link" | "account" | "image";
  linkUrl: string | null;
  accountType?: "luckin";
};

type ClaimHistoryItem = {
  claimId: string;
  productKey: string;
  productName: string;
  phoneNumber: string;
  emailAddress: string | null;
  emailOtp: string | null;
  otp: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  luckinAccount: { email: string; password: string } | null;
  voucherImageUrl: string | null;
};

type ClaimPhase = "email" | "phone" | "otp" | null;
type ClaimState = "idle" | "claiming" | "waiting_email" | "waiting_phone" | "waiting_otp" | "success" | "cancelled" | "expired";
type ActiveClaim = {
  claimId: string;
  phoneNumber: string;
  emailAddress: string | null;
  emailOtp: string | null;
  accountPassword?: string | null;
  voucherImageUrl?: string | null;
  productName: string;
  productKey: string;
  expiresAt: number;
};

const OTP_POLL_INTERVAL_MS = 5000;
const CLAIM_DURATION_MS = 15 * 60 * 1000;
const ACTIVE_CLAIM_ID_KEY = "nishinae.activeClaimId";

function RedeemPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlOrderId = searchParams.get("orderId") ?? "";
  const [orderIdInput, setOrderIdInput] = useState(urlOrderId);
  const [orderDetails, setOrderDetails] = useState<OrderDetailsResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "activations">("products");

  const [infoModalProduct, setInfoModalProduct] = useState<ProductConfig | null>(null);
  const [voucherImageModal, setVoucherImageModal] = useState<string | null>(null);
  const [voucherConfirmModal, setVoucherConfirmModal] = useState<{ url: string; productKey: string } | null>(null);
  const [productInstructions, setProductInstructions] = useState<Record<string, string>>({});
  const [productVideos, setProductVideos] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/products/content")
      .then((r) => r.json())
      .then((d) => {
        if (d.products) {
          const instrMap: Record<string, string> = {};
          const videoMap: Record<string, string> = {};
          for (const p of d.products) {
            instrMap[p.key] = p.redemptionInstructions;
            if (p.tutorialVideoUrl) videoMap[p.key] = p.tutorialVideoUrl;
          }
          setProductInstructions(instrMap);
          setProductVideos(videoMap);
        }
      })
      .catch(() => {});
  }, []);

  function openInfoModal(productKey: string) {
    const base = PRODUCT_MAP[productKey as keyof typeof PRODUCT_MAP];
    if (!base) return;
    const instructions = productInstructions[productKey] ?? base.redemptionInstructions;
    setInfoModalProduct({ ...base, redemptionInstructions: instructions });
  }

  // Active claim state (for current claiming session)
  const [activeClaim, setActiveClaim] = useState<ActiveClaim | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [otp, setOtp] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [claimStartTime, setClaimStartTime] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [claimingProduct, setClaimingProduct] = useState<OrderProduct | null>(null);
  const [revealedLinks, setRevealedLinks] = useState<Set<string>>(new Set());
  const [waitingForPhone, setWaitingForPhone] = useState(false);

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

  // Copy helper with toast notification
  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${label}`));
  }

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

      // Clear any stale active claim from previous orders to prevent cache mix-up
      if (activeClaim && activeClaim.claimId) {
        const isClaimForCurrentOrder = data.claims.some(
          (c) => c.claimId === activeClaim.claimId
        );
        if (!isClaimForCurrentOrder) {
          setActiveClaim(null);
          setClaimState("idle");
          setEmailOtp(null);
          setOtp(null);
          clearActiveClaimId();
        }
      }

      const trimmed = orderIdInput.trim();
      // Persist orderId in URL so refresh / in-app browser navigation retains state
      if (urlOrderId !== trimmed) {
        router.replace(`${pathname}?orderId=${encodeURIComponent(trimmed)}`);
      }
      toast.success(`Order validated. ${data.products.length} product(s) found.`);
    } catch {
      toast.error("Could not validate order. Try again.");
    } finally {
      setIsValidating(false);
    }
  }

  // Poll for email OTP (CBTL specific)
  useEffect(() => {
    if (claimState !== "waiting_email" || !activeClaim) return;

    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/claim/email-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimId: activeClaim.claimId })
        });
        const data = await response.json();

        if (!response.ok) return;

        if (data.status === "success" && data.emailOtp) {
          setEmailOtp(data.emailOtp);
          setOtp(data.emailOtp);  // Use email OTP as final OTP
          setActiveClaim((prev) => prev ? { ...prev, emailOtp: data.emailOtp } : null);
          setClaimState("success");
          setTimeLeftMs(0);
          setExpiresAt(null);
          clearActiveClaimId();
          toast.success("Email OTP received! Order complete.");
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

  // Request phone number for CBTL (after email OTP phase)
  async function startPhonePhase() {
    if (!activeClaim || !orderDetails) return;

    setWaitingForPhone(true);
    try {
      const response = await fetch("/api/claim/phone-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderDetails.orderId,
          orderItemId: claimingProduct?.itemId,
          claimId: activeClaim.claimId
        })
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message ?? "Unable to get phone number.");
        setWaitingForPhone(false);
        return;
      }

      setActiveClaim((prev) => prev ? {
        ...prev,
        phoneNumber: data.phoneNumber,
        expiresAt: data.expiresAt ?? Date.now() + CLAIM_DURATION_MS
      } : null);
      setExpiresAt(data.expiresAt ?? Date.now() + CLAIM_DURATION_MS);
      setTimeLeftMs((data.expiresAt ?? Date.now() + CLAIM_DURATION_MS) - Date.now());
      setClaimState("waiting_otp");
      setWaitingForPhone(false);
      toast.success(`Phone number ${data.phoneNumber} allocated. Waiting for SMS OTP.`);
    } catch {
      toast.error("Failed to get phone number. Please retry.");
      setWaitingForPhone(false);
    }
  }

  async function startClaim(product: OrderProduct) {
    if (!orderDetails) return;

    setClaimingProduct(product);
    setClaimState("claiming");
    setOtp(null);
    setEmailOtp(null);
    setWaitingForPhone(false);

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

      // CBTL: email-first flow
      const isCbtl = product.productKey === "cbtl";
      // Luckin: account-type product (email + password)
      const isAccountProduct = product.productType === "account";

      const isImageProduct = product.productType === "image";

      setActiveClaim({
        claimId: data.claimId,
        phoneNumber: data.phoneNumber ?? "",
        emailAddress: data.emailAddress ?? null,
        emailOtp: data.emailOtp ?? null,
        accountPassword: data.accountPassword ?? null,
        voucherImageUrl: data.voucherImageUrl ?? null,
        productName: product.productName,
        productKey: product.productKey,
        expiresAt: data.expiresAt ?? Date.now() + CLAIM_DURATION_MS
      });
      setExpiresAt(data.expiresAt ?? Date.now() + CLAIM_DURATION_MS);
      setTimeLeftMs((data.expiresAt ?? Date.now() + CLAIM_DURATION_MS) - Date.now());

      if (isImageProduct && data.voucherImageUrl) {
        // Image-based product (Tealive vouchers) — show image immediately
        setClaimState("success");
        setOtp(null);
        toast.success(`Voucher assigned for ${product.productName}. Show the image below to redeem.`);
      } else if (isAccountProduct && data.emailAddress) {
        // Luckin account — show email + password immediately
        setClaimState("success");
        setOtp(null);
        toast.success(`Account assigned for ${product.productName}. Use the credentials below to log in.`);
      } else if (isCbtl && data.resumeNewOtp) {
        // Existing success claim — show it with option to request new OTP
        setClaimState("success");
        setEmailOtp(data.emailOtp ?? null);
        setOtp(data.emailOtp ?? null);
        toast.message(`Email ${data.emailAddress} already assigned. OTP expired? Use the button below.`);
      } else if (isCbtl && data.emailAddress) {
        // CBTL email phase — new claim
        setClaimState("waiting_email");
        setEmailOtp(data.emailOtp ?? null);
        toast.success(`Email ${data.emailAddress} assigned. Check your email for OTP.`);
      } else {
        // Standard OTP flow (non-CBTL)
        setClaimState("waiting_otp");
        toast.success(`Number claimed for ${product.productName}. Waiting for OTP.`);
      }

      setClaimStartTime(Date.now());
      setActiveClaimId(data.claimId);
    } catch {
      toast.error("Claim failed. Please retry.");
      setClaimState("idle");
      setClaimingProduct(null);
    }
  }

  const [resettingOtp, setResettingOtp] = useState(false);
  const [requestingNewOtp, setRequestingNewOtp] = useState(false);
  const [resendingSmsOtp, setResendingSmsOtp] = useState(false);
  const [resendPending, setResendPending] = useState(false);

  async function resendSmsOtp() {
    if (!activeClaim?.claimId || resendingSmsOtp) return;
    setResendingSmsOtp(true);
    try {
      const res = await fetch("/api/claim/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: activeClaim.claimId })
      });
      const data = await res.json();
      if (res.ok) {
        setResendPending(true); // keep success UI visible, poll in background
        toast.success("OTP resent! Waiting for new SMS...");
      } else {
        toast.error(data.message ?? "Could not resend OTP.");
      }
    } catch {
      toast.error("Request failed. Try again.");
    } finally {
      setResendingSmsOtp(false);
    }
  }

  async function requestNewOtp() {
    if (!activeClaim?.claimId || requestingNewOtp) return;
    setRequestingNewOtp(true);
    try {
      const res = await fetch("/api/claim/request-new-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: activeClaim.claimId })
      });
      const data = await res.json();
      if (res.ok) {
        setEmailOtp(null);
        setOtp(null);
        setActiveClaim((prev) => prev ? { ...prev, emailOtp: null, expiresAt: data.expiresAt } : null);
        setExpiresAt(data.expiresAt);
        setTimeLeftMs(data.expiresAt - Date.now());
        setClaimState("waiting_email");
        setActiveClaimId(activeClaim.claimId);
        toast.success("Ready for new OTP — resend from the CBTL app using the same email.");
      } else {
        toast.error(data.message ?? "Could not request new OTP.");
      }
    } catch {
      toast.error("Request failed. Try again.");
    } finally {
      setRequestingNewOtp(false);
    }
  }

  async function resetEmailOtp() {
    if (!activeClaim?.claimId || resettingOtp) return;
    setResettingOtp(true);
    try {
      const res = await fetch("/api/claim/email-otp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: activeClaim.claimId })
      });
      if (res.ok) {
        setEmailOtp(null);
        setOtp(null);
        setActiveClaim((prev) => prev ? { ...prev, emailOtp: null } : null);
        toast.success("Ready for new OTP. Resend from the CBTL app now.");
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Could not reset OTP.");
      }
    } catch {
      toast.error("Reset failed. Try again.");
    } finally {
      setResettingOtp(false);
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

  // Countdown timer for waiting and success phases
  useEffect(() => {
    const isActive = claimState === "waiting_otp" || claimState === "waiting_email" || claimState === "success";
    if (!isActive || !activeClaim || !expiresAt) return;

    const interval = setInterval(() => {
      const nextLeft = expiresAt - Date.now();
      setTimeLeftMs(nextLeft);
      if (nextLeft <= 0) {
        clearInterval(interval);
        if (claimState === "success") {
          // Timer expired after OTP received — just stop the timer, don't cancel the claim
          setTimeLeftMs(0);
          setExpiresAt(null);
        } else {
          cancelClaim("expired");
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cancelClaim, claimState, activeClaim, expiresAt]);

  // Poll for new OTP after resend (stays in success state, no UI flash)
  useEffect(() => {
    if (!resendPending || claimState !== "success" || !activeClaim) return;

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
          setResendPending(false);
          toast.success("New OTP received.");
          clearInterval(poll);
        } else if (data.status === "cancelled" || data.status === "expired") {
          setResendPending(false);
          clearInterval(poll);
        }
      } catch { /* ignore */ }
    }, OTP_POLL_INTERVAL_MS);

    return () => clearInterval(poll);
  }, [resendPending, claimState, activeClaim]);

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
          // Keep activeClaim, expiresAt and localStorage claim ID so:
          // - timer keeps showing how long resend is available
          // - other devices/sessions can restore this claim
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
        if (data.status === "waiting_otp" || data.status === "waiting_email") {
          setActiveClaim({
            claimId: data.claimId,
            phoneNumber: data.phoneNumber ?? "",
            emailAddress: data.emailAddress ?? null,
            emailOtp: data.emailOtp ?? null,
            accountPassword: data.accountPassword ?? null,
            voucherImageUrl: data.voucherImageUrl ?? null,
            productName: data.productName || "Product",
            productKey: data.productKey || "unknown",
            expiresAt: data.expiresAt
          });
          setExpiresAt(data.expiresAt);
          setTimeLeftMs(data.expiresAt - Date.now());
          setEmailOtp(data.emailOtp ?? null);
          setClaimStartTime(Date.now()); // Set claim start time for restored session

          // Determine phase: if has email but no phone number yet, it's email phase
          const hasEmail = !!data.emailAddress;
          const hasPhone = !!data.phoneNumber && data.phoneNumber !== "";
          if (data.status === "waiting_email" || (hasEmail && !hasPhone)) {
            setClaimState("waiting_email");
          } else {
            setClaimState("waiting_otp");
          }
        } else if (data.status === "success") {
          setOtp(data.otp);
          setEmailOtp(data.emailOtp ?? null);
          setClaimState("success");
          // Restore activeClaim for both email and SMS success claims
          const stillActive = data.expiresAt > Date.now();
          if (data.emailAddress || stillActive || data.voucherImageUrl) {
            setActiveClaim({
              claimId: data.claimId,
              phoneNumber: data.phoneNumber ?? "",
              emailAddress: data.emailAddress ?? null,
              emailOtp: data.emailOtp ?? null,
              accountPassword: data.accountPassword ?? null,
              voucherImageUrl: data.voucherImageUrl ?? null,
              productName: data.productName || "Product",
              productKey: data.productKey || "unknown",
              expiresAt: data.expiresAt
            });
            setActiveClaimId(data.claimId);
            if (stillActive) {
              setExpiresAt(data.expiresAt);
              setTimeLeftMs(data.expiresAt - Date.now());
            }
          } else {
            clearActiveClaimId();
          }
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

  // Auto-revalidate from URL only (no localStorage cache)
  useEffect(() => {
    if (orderDetails) return;
    const targetId = urlOrderId || "";
    if (!targetId) return;
    setOrderIdInput(targetId);
    (async () => {
      try {
        const response = await fetch("/api/orders/details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: targetId })
        });
        const data = (await response.json()) as OrderDetailsResponse;
        if (response.ok && data.valid) {
          setOrderDetails(data);
          if (urlOrderId !== targetId) {
            router.replace(`${pathname}?orderId=${encodeURIComponent(targetId)}`);
          }
          // Clear stale claim if it doesn't belong to this order
          const savedClaimId = localStorage.getItem(ACTIVE_CLAIM_ID_KEY);
          if (savedClaimId && !data.claims.some((c) => c.claimId === savedClaimId)) {
            clearActiveClaimId();
            setActiveClaim(null);
            setClaimState("idle");
          }
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOrderId]);

  // Continuously poll order details so any device viewing the same order sees the live state
  useEffect(() => {
    if (!orderDetails) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/orders/details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderDetails.orderId })
        });
        const data = (await response.json()) as OrderDetailsResponse;
        if (response.ok && data.valid) {
          setOrderDetails(data);
          // If active claim no longer exists in this order, clear it
          if (activeClaim && !data.claims.some((c) => c.claimId === activeClaim.claimId)) {
            setActiveClaim(null);
            setClaimState("idle");
            setEmailOtp(null);
            setOtp(null);
            clearActiveClaimId();
          }
        }
      } catch {
        // ignore transient errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [orderDetails?.orderId]);

  // Auto-restore CBTL claim from order history when page loads
  // Only restore if no remaining quantity — otherwise allow claiming new emails
  useEffect(() => {
    if (!orderDetails || activeClaim || claimState !== "idle") return;

    // Find the most recent CBTL claim (success or waiting)
    const cbtlClaim = orderDetails.claims.find(
      (c) => (c.status === "success" || c.status === "waiting_otp") && c.productKey === "cbtl" && c.emailAddress
    );

    if (cbtlClaim) {
      // Check if there's remaining quantity for this product
      const cbtlProduct = orderDetails.products.find((p) => p.productKey === "cbtl");
      const hasRemainingQty = (cbtlProduct?.remainingQty ?? 0) > 0;

      // If there's remaining quantity, don't restore — let user claim a new email
      if (hasRemainingQty) return;
      setActiveClaim({
        claimId: cbtlClaim.claimId,
        phoneNumber: cbtlClaim.phoneNumber ?? "",
        emailAddress: cbtlClaim.emailAddress,
        emailOtp: cbtlClaim.emailOtp ?? null,
        productName: cbtlClaim.productName,
        productKey: cbtlClaim.productKey,
        expiresAt: new Date(cbtlClaim.expiresAt).getTime()
      });
      setEmailOtp(cbtlClaim.emailOtp ?? null);
      setOtp(cbtlClaim.otp ?? null);

      // Determine state: if waiting and has email but no phone, it's email phase
      const hasPhone = !!cbtlClaim.phoneNumber && cbtlClaim.phoneNumber !== "";
      if (cbtlClaim.status === "waiting_otp" && !hasPhone) {
        setClaimState("waiting_email");
        setExpiresAt(new Date(cbtlClaim.expiresAt).getTime());
        setTimeLeftMs(new Date(cbtlClaim.expiresAt).getTime() - Date.now());
        setClaimStartTime(Date.now());
      } else {
        setClaimState(cbtlClaim.status as ClaimState);
      }

      setActiveClaimId(cbtlClaim.claimId);

      // Also set claimingProduct so the UI shows the product context
      const match = orderDetails.products.find(
        (p) => p.productKey === cbtlClaim.productKey
      );
      if (match) setClaimingProduct(match);
    }
  }, [orderDetails]);

  // Link restored activeClaim to a product once orderDetails is loaded
  useEffect(() => {
    if (!activeClaim || !orderDetails || claimingProduct) return;
    const match = orderDetails.products.find(
      (p) => p.productName === activeClaim.productName || p.productKey === activeClaim.productKey
    );
    if (match) {
      setClaimingProduct(match);
      if (activeClaim.productKey === "unknown") {
        setActiveClaim({ ...activeClaim, productKey: match.productKey });
      }
      if (!claimStartTime) setClaimStartTime(Date.now());
    }
  }, [activeClaim, orderDetails, claimingProduct, claimStartTime]);

  // Detect server-side active claim (waiting_otp) so any device viewing this
  // order sees the live claim state (not just the original claimer's browser).
  // Also reacts to server-side claim expirations / status changes.
  useEffect(() => {
    if (!orderDetails) return;
    const waitingClaim = orderDetails.claims.find((c) => c.status === "waiting_otp");

    if (!waitingClaim) {
      // No server-side waiting claim. If we currently show one, clear it.
      if (activeClaim && claimState === "waiting_otp") {
        setActiveClaim(null);
        setExpiresAt(null);
        setTimeLeftMs(0);
        setClaimState("idle");
        setClaimingProduct(null);
      }
      return;
    }

    const expiresMs = new Date(waitingClaim.expiresAt).getTime();
    if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) return;

    // Update or set active claim from server data (single source of truth)
    if (!activeClaim || activeClaim.claimId !== waitingClaim.claimId) {
      setActiveClaim({
        claimId: waitingClaim.claimId,
        phoneNumber: waitingClaim.phoneNumber,
        emailAddress: waitingClaim.emailAddress ?? null,
        emailOtp: waitingClaim.emailOtp ?? null,
        productName: waitingClaim.productName,
        productKey: waitingClaim.productKey,
        expiresAt: expiresMs
      });
      setEmailOtp(waitingClaim.emailOtp ?? null);
      setExpiresAt(expiresMs);
      setTimeLeftMs(expiresMs - Date.now());
      setClaimState("waiting_otp");
      const createdMs = new Date(waitingClaim.createdAt).getTime();
      setClaimStartTime(Number.isNaN(createdMs) ? Date.now() : createdMs);
    }
  }, [orderDetails, activeClaim, claimState]);

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
            <Link
              href="/tutorial"
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:bg-violet-950 dark:hover:text-violet-400"
            >
              Tutorials
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">Redeem Order</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Enter order ID to view products and claim numbers.
        </p>

        <form onSubmit={validateOrder} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={orderIdInput}
              onChange={(event) => setOrderIdInput(event.target.value)}
              placeholder="Enter Order ID"
              className="w-full border border-slate-300 bg-white px-4 py-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            {orderIdInput && (
              <button
                type="button"
                onClick={() => setOrderIdInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
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
                  <div key={product.productKey + product.itemId} className="space-y-0">
                    {productVideos[product.productKey] && (
                      <div className="overflow-hidden border border-slate-200 dark:border-slate-700">
                        <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                          {product.productName} — Tutorial
                        </p>
                        <div className="aspect-video w-full bg-black">
                          <iframe
                            src={productVideos[product.productKey]}
                            className="h-full w-full"
                            allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            title={`${product.productName} Tutorial`}
                          />
                        </div>
                      </div>
                    )}
                  <div
                    className="flex items-center gap-4 border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <img
                      src={product.logoUrl}
                      alt={product.productName}
                      className="h-12 w-12 object-contain bg-white p-1"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{product.productName}</h3>
                      {(product.productType === "otp" || product.productType === "image") && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {product.remainingQty} of {product.totalQuantity} remaining
                        </p>
                      )}
                    </div>

                    {product.productType === "link" ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openInfoModal(product.productKey)}
                          className="p-2 text-slate-400 transition hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400"
                          title="View redemption info"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        </button>
                        {revealedLinks.has(product.productKey) ? (
                          <a
                            href={product.linkUrl ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 dark:text-slate-950 dark:hover:bg-violet-400"
                          >
                            Open Link
                          </a>
                        ) : (
                          <button
                            onClick={() => setRevealedLinks((prev) => new Set(prev).add(product.productKey))}
                            className="bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 dark:text-slate-950 dark:hover:bg-cyan-400"
                          >
                            Get Link
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openInfoModal(product.productKey)}
                          className="p-2 text-slate-400 transition hover:text-violet-600 dark:text-slate-500 dark:hover:text-violet-400"
                          title="View redemption info"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        </button>
                        <button
                          onClick={() => startClaim(product)}
                          disabled={!product.canClaim || claimState === "claiming" || claimState === "waiting_email" || claimState === "waiting_otp"}
                          className="bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-950 dark:hover:bg-cyan-400"
                        >
                          {claimState === "claiming" && claimingProduct?.productKey === product.productKey
                            ? "Claiming..."
                            : claimState === "waiting_email" && claimingProduct?.productKey === product.productKey
                              ? "Waiting Email..."
                              : claimState === "waiting_otp" && claimingProduct?.productKey === product.productKey
                                ? "Waiting OTP..."
                                : product.canClaim
                                  ? (product.productType === "image" ? "Get Voucher" : product.productType === "account" ? "Get Account" : product.productKey === "cbtl" ? "Get Email" : "Get Number")
                                  : "0 left"}
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                ))}

                {/* Active Claim Display */}
                <AnimatePresence>
                  {claimState === "claiming" && claimingProduct && !activeClaim && (
                    <motion.div
                      key="claiming-loading"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="border-l-4 border-violet-500 bg-slate-100 p-4 dark:bg-slate-800/50"
                    >
                      <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">
                        {claimingProduct.productName} — Allocating Number...
                      </p>
                      <p className="mt-3 animate-pulse text-sm text-slate-500 dark:text-slate-400">Please wait...</p>
                    </motion.div>
                  )}
                  {activeClaim && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border-l-4 border-violet-500 bg-slate-100 p-4 dark:bg-slate-800/50"
                    >
                      <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">
                        {activeClaim.productName} - {claimState === "waiting_email" ? "Email Verification" : claimState === "success" ? "Complete" : "Claimed"}
                      </p>

                      {/* Email Address Display (CBTL) */}
                      {activeClaim.emailAddress && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Email Address:</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{activeClaim.emailAddress}</p>
                            <button
                              onClick={() => copyToClipboard(activeClaim.emailAddress ?? "", "email")}
                              className="p-2 text-slate-400 transition hover:text-cyan-600"
                              title="Copy email"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Account Password Display (for Luckin and account-type products) */}
                      {activeClaim.accountPassword && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Password:</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{activeClaim.accountPassword}</p>
                            <button
                              onClick={() => copyToClipboard(activeClaim.accountPassword ?? "", "password")}
                              className="p-2 text-slate-400 transition hover:text-cyan-600"
                              title="Copy password"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Voucher Image Display (for image-type products like Tealive) */}
                      {activeClaim.voucherImageUrl && (
                        <div className="mt-4">
                          <button
                            onClick={() => setVoucherConfirmModal({ url: activeClaim.voucherImageUrl!, productKey: activeClaim.productKey })}
                            className="w-full rounded-lg border-2 border-amber-500 bg-amber-500/10 px-6 py-4 text-center transition hover:bg-amber-500/20 dark:border-amber-500 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
                          >
                            <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400">
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                              <span className="font-bold">View Voucher</span>
                            </div>
                            <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
                              Click to confirm redemption locations
                            </p>
                          </button>
                        </div>
                      )}

                      {/* Email OTP Display */}
                      {emailOtp && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-3 border-l-4 border-emerald-500 bg-white p-3 dark:bg-slate-900"
                        >
                          <p className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Email OTP</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{emailOtp}</p>
                            <button
                              onClick={() => copyToClipboard(emailOtp, "Email OTP")}
                              className="p-2 text-slate-400 transition hover:text-emerald-600"
                              title="Copy Email OTP"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* CBTL Important Notice - Log In vs Create Account */}
                      {activeClaim.productKey === "cbtl" && (
                        <div className="mt-3 border-2 border-amber-500 bg-amber-50 p-4 dark:border-amber-400 dark:bg-amber-950/30">
                          <div className="flex items-start gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                            <div>
                              <p className="font-bold text-amber-800 dark:text-amber-300">IMPORTANT: Click &quot;Log In&quot; NOT &quot;Create Account&quot;</p>
                              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">In the CBTL app, tap <strong className="font-semibold">&quot;Log In&quot;</strong> (not &quot;Create Account&quot;) when you see the Register/Login screen. Use the email address above to log in.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Phone Number Display (only when allocated) */}
                      {activeClaim.phoneNumber && activeClaim.phoneNumber !== "" && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Phone Number:</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeClaim.phoneNumber?.replace(/^6/, "")}</p>
                            <button
                              onClick={() => copyToClipboard(activeClaim.phoneNumber?.replace(/^6/, "") ?? "", "phone number")}
                              className="p-2 text-slate-400 transition hover:text-cyan-600"
                              title="Copy number"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Email Phase - Waiting for Email OTP */}
                      {claimState === "waiting_email" && (
                        <>
                          <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-emerald-500 bg-white p-3 dark:bg-slate-900">
                            <div>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">Waiting for Email OTP...</p>
                              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{countdownLabel}</p>
                            </div>
                            <button
                              onClick={() => cancelClaim("cancelled")}
                              className="border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="mt-2 border-l-2 border-emerald-500 bg-white p-3 dark:bg-slate-900">
                            <p className="text-xs text-slate-500">• Login with the email for the 6-digit OTP from CBTL.</p>
                            <p className="text-xs text-slate-500">• The OTP will appear automatically once received.</p>
                            <p className="text-xs text-slate-500">• Once confirmed, your order is complete!</p>
                            <button
                              onClick={resetEmailOtp}
                              disabled={resettingOtp}
                              className="mt-2 text-xs text-emerald-600 underline hover:text-emerald-500 disabled:opacity-50 dark:text-emerald-400"
                            >
                              {resettingOtp ? "Resetting..." : "Didn\u2019t receive OTP? Click here after resending from CBTL app"}
                            </button>
                          </div>
                        </>
                      )}


                      {/* Standard OTP Phase */}
                      {claimState === "waiting_otp" && (
                        <>
                          <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-amber-500 bg-white p-3 dark:bg-slate-900">
                            <div>
                              <p className="text-xs text-amber-600 dark:text-amber-400">Waiting for SMS OTP...</p>
                              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{countdownLabel}</p>
                            </div>
                            <button
                              onClick={() => cancelClaim("cancelled")}
                              className="border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="mt-2 border-l-2 border-amber-500 bg-white p-3 dark:bg-slate-900">
                            <p className="text-xs text-slate-500">• Please remain on this page until the OTP appears.</p>
                            <p className="text-xs text-slate-500">• If you are not able to get the OTP in 5 mins, click Cancel button and generate a new one.</p>
                            {activeClaim?.productKey === "zus" && (
                              <div className="mt-2 border border-amber-400 bg-amber-50 px-3 py-2 dark:bg-amber-900/30">
                                <p className="text-sm font-bold text-amber-700 dark:text-amber-300">⚠️ IMPORTANT: Enter referral code <span className="font-mono tracking-widest">&quot;DANIFQP&quot;</span> when registering on the ZUS app!</p>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {claimState === "success" && emailOtp && (
                        <div className="mt-3 border-l-2 border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-900">
                          <p className="text-xs text-slate-500 dark:text-slate-400">If the OTP above has expired on the CBTL app, you can request a fresh one using the same email.</p>
                          <button
                            onClick={requestNewOtp}
                            disabled={requestingNewOtp}
                            className="mt-2 border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                          >
                            {requestingNewOtp ? "Requesting..." : "OTP expired? Request new OTP"}
                          </button>
                        </div>
                      )}

                      {claimState === "success" && otp && !emailOtp && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-3 border-l-4 border-cyan-500 bg-white p-3 dark:bg-slate-900"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-widest text-cyan-600 dark:text-cyan-400">OTP</p>
                            {timeLeftMs > 0 && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">Resend available for <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">{countdownLabel}</span></span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            {resendPending ? (
                              <p className="animate-pulse text-lg font-semibold text-slate-400 dark:text-slate-500">Waiting for new SMS...</p>
                            ) : (
                              <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{otp}</p>
                            )}
                            {!resendPending && (
                              <button
                                onClick={() => copyToClipboard(otp, "OTP")}
                                className="p-2 text-slate-400 transition hover:text-cyan-600"
                                title="Copy OTP"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                              </button>
                            )}
                          </div>
                          {timeLeftMs > 0 && !resendPending && (
                            <button
                              onClick={resendSmsOtp}
                              disabled={resendingSmsOtp}
                              className="mt-3 w-full border border-cyan-500/50 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-500/20 disabled:opacity-50 dark:text-cyan-400"
                            >
                              {resendingSmsOtp ? "Resending..." : "OTP expired? Resend SMS OTP"}
                            </button>
                          )}
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
                        {claim.emailAddress && (
                          <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{claim.emailAddress}</p>
                        )}
                        {claim.phoneNumber && (
                          <p className="text-sm font-mono text-slate-600 dark:text-slate-400">{claim.phoneNumber.replace(/^6/, "")}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {claim.status === "success" && claim.otp ? (
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{claim.otp}</span>
                            <button
                              onClick={() => copyToClipboard(claim.otp!, "OTP")}
                              className="p-1.5 text-slate-400 transition hover:text-cyan-600"
                              title="Copy OTP"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                          </div>
                        ) : claim.status === "success" && claim.luckinAccount ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-500 dark:text-slate-400">Password:</span>
                              <span className="font-mono text-sm font-bold text-cyan-600 dark:text-cyan-400">{claim.luckinAccount.password}</span>
                              <button
                                onClick={() => copyToClipboard(claim.luckinAccount!.password, "password")}
                                className="p-1 text-slate-400 transition hover:text-cyan-600"
                                title="Copy password"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                              </button>
                            </div>
                          </div>
                        ) : claim.status === "success" && claim.voucherImageUrl ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">Voucher assigned</span>
                            <button
                              onClick={() => setVoucherConfirmModal({ url: claim.voucherImageUrl!, productKey: claim.productKey })}
                              className="text-xs text-cyan-600 underline hover:text-cyan-500 dark:text-cyan-400"
                            >
                              View Voucher
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

      {/* Voucher Confirmation Modal */}
      {voucherConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setVoucherConfirmModal(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto border-2 border-amber-500 bg-white p-6 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              <h3 className="text-lg font-bold">Important: Redemption Locations</h3>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p className="font-medium text-emerald-600 dark:text-emerald-400">
                ✅ This voucher is redeemable at ALL Tealive outlets EXCEPT:
              </p>
              <ul className="ml-4 list-disc space-y-1 text-red-600 dark:text-red-400">
                <li>KLIA2</li>
                <li>KIDZANIA</li>
                <li>JOHOR PREMIUM OUTLETS</li>
                <li>MAXVALU</li>
                <li>AEON DELICA (Tealive Kiosk inside Aeon&apos;s Food Court)</li>
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                By clicking &quot;I Understand, Show Voucher&quot;, you acknowledge that you have read and understood these redemption restrictions. The voucher will NOT work at the excluded locations listed above.
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setVoucherConfirmModal(null)}
                className="flex-1 border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setVoucherImageModal(voucherConfirmModal.url);
                  setVoucherConfirmModal(null);
                }}
                className="flex-1 border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
              >
                I Understand, Show Voucher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Image Modal */}
      {voucherImageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setVoucherImageModal(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-lg border-2 border-emerald-500 bg-white p-2 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setVoucherImageModal(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <img
              src={voucherImageModal}
              alt="Voucher"
              className="h-auto w-full rounded object-contain"
            />
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              Screenshot this voucher and show it to the Tearista
            </p>
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
    tealive_rm5: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEaSAISBahRRXbolEAdKw2fFKL6sqd0pOKyg&s",
    tealive_b1f1: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEaSAISBahRRXbolEAdKw2fFKL6sqd0pOKyg&s",
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
