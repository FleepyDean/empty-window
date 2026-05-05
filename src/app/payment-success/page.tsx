"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme";

type OrderItem = {
  productName: string;
  quantity: number;
};

type OrderDetails = {
  valid: boolean;
  orderId: string;
  isCartOrder: boolean;
  products: Array<{
    productName: string;
    totalQuantity: number;
  }>;
  productName?: string;
  quantity?: number;
};

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);

  useEffect(() => {
    if (orderId) {
      // Fetch order details with items (handles cart orders)
      fetch("/api/orders/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.valid) {
            setOrderDetails(d);
          }
        })
        .catch(() => {});
    }
  }, [orderId]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <section className="border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Payment Successful
          </p>
          <ThemeToggle />
        </div>

        <div className="mt-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">
            Thank you for your purchase!
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Your payment has been received and your order is being processed.
          </p>

          {orderId && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-400">Order ID</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900 dark:text-white">
                {orderId}
              </p>
              {orderDetails && (
                <>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    {orderDetails.isCartOrder ? "Products" : "Product"}
                  </p>
                  {orderDetails.isCartOrder ? (
                    <div className="mt-1 space-y-1">
                      {orderDetails.products.map((product, index) => (
                        <p key={index} className="font-medium text-slate-900 dark:text-white">
                          {product.productName} x{product.totalQuantity}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium text-slate-900 dark:text-white">
                      {orderDetails.productName || orderDetails.products[0]?.productName} x{orderDetails.quantity || orderDetails.products[0]?.totalQuantity}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={orderId ? `/redeem?orderId=${encodeURIComponent(orderId)}` : "/redeem"}
              className="inline-flex items-center justify-center bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 dark:text-slate-950"
            >
              Redeem Your Order
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

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <PaymentSuccessContent />
    </Suspense>
  );
}
