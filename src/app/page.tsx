"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRODUCT_CATALOG, ProductConfig, ProductKey } from "@/lib/products";
import { ThemeToggle } from "@/components/theme";
import { toast } from "sonner";

type CartItem = {
  productKey: ProductKey;
  productName: string;
  priceLabel: string;
  quantity: number;
  logoUrl: string;
};

type CheckoutResponse = {
  message: string;
  orderId: string;
};

export default function StorePage() {
  const [products, setProducts] = useState<ProductConfig[]>(PRODUCT_CATALOG);
  const [quantities, setQuantities] = useState<Record<ProductKey, number>>(() => {
    const initial: Record<string, number> = {};
    PRODUCT_CATALOG.forEach((p) => (initial[p.key] = 1));
    return initial;
  });

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({ name: "", email: "", phone: "" });

  const [infoModalProduct, setInfoModalProduct] = useState<ProductConfig | null>(null);
  const [latestOrder, setLatestOrder] = useState<CheckoutResponse | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => { if (d.products) setProducts(d.products); })
      .catch(() => {});
  }, []);

  function setQuantity(productKey: ProductKey, value: number) {
    setQuantities((prev) => ({ ...prev, [productKey]: Math.max(1, value) }));
  }

  function addToCart(product: ProductConfig) {
    const quantity = quantities[product.key] ?? 1;
    setCart((prev) => {
      const existing = prev.find((item) => item.productKey === product.key);
      if (existing) {
        return prev.map((item) =>
          item.productKey === product.key
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, {
        productKey: product.key,
        productName: product.name,
        priceLabel: product.priceLabel,
        quantity,
        logoUrl: product.logoUrl
      }];
    });
    toast.success(`Added ${quantity}x ${product.name} to cart`);
    setIsCartOpen(true);
  }

  function removeFromCart(productKey: ProductKey) {
    setCart((prev) => prev.filter((item) => item.productKey !== productKey));
  }

  function updateCartQuantity(productKey: ProductKey, newQuantity: number) {
    if (newQuantity <= 0) {
      removeFromCart(productKey);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.productKey === productKey ? { ...item, quantity: newQuantity } : item
      )
    );
  }

  function clearCart() {
    setCart([]);
  }

  function calculateItemTotal(item: CartItem): number {
    const priceMatch = item.priceLabel.match(/RM\s*(\d+\.?\d*)/i);
    const unitPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
    return unitPrice * item.quantity;
  }

  function calculateCartTotal(): number {
    return cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  }

  async function checkout() {
    if (cart.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }

    // Validate customer info
    if (!customerInfo.name.trim() || !customerInfo.email.trim() || !customerInfo.phone.trim()) {
      toast.error("Please fill in all customer details.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerInfo.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const phoneRegex = /^[0-9+\-\s]{8,15}$/;
    if (!phoneRegex.test(customerInfo.phone)) {
      toast.error("Please enter a valid phone number.");
      return;
    }

    setIsCheckingOut(true);

    try {
      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((item) => ({
            productKey: item.productKey,
            quantity: item.quantity
          })),
          customerName: customerInfo.name.trim(),
          customerEmail: customerInfo.email.trim(),
          customerPhone: customerInfo.phone.trim(),
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.message ?? "Payment creation failed.");
        return;
      }

      toast.success("Redirecting to payment...");
      setLatestOrder({ orderId: data.orderId, message: "Order created" });
      window.location.href = data.paymentUrl;

    } catch {
      toast.error("Checkout failed. Please retry.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <section className="border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">Nishinae Store</p>
          <div className="flex items-center gap-2">
            <a
              href="https://t.me/nishinaestore"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-sky-500 dark:hover:bg-sky-950 dark:hover:text-sky-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Contact
            </a>
            <ThemeToggle />
          </div>
        </div>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl dark:text-white">Your Daily Life Necessities</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Add products to cart, complete checkout and receive an order ID for redemption.
        </p>

        {/* Cart Button */}
        <button
          onClick={() => setIsCartOpen(true)}
          className="mt-6 flex items-center gap-2 border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-cyan-500 dark:hover:text-cyan-400"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          Cart ({cartItemCount})
        </button>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <article
              key={product.key}
              className="border-l-2 border-violet-500 bg-slate-100 p-5 transition hover:bg-slate-200 dark:bg-slate-800/50 dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <img
                  src={product.logoUrl}
                  alt={product.name}
                  className="h-10 w-10 object-contain bg-white p-1"
                />
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{product.name}</h2>
                <button
                  onClick={() => setInfoModalProduct(product)}
                  className="ml-auto p-1.5 text-slate-500 transition hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
                  title="Redemption info"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </button>
              </div>
              <p className="mt-2 text-sm font-medium text-cyan-600 dark:text-cyan-400">{product.priceLabel}</p>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-xs uppercase tracking-wide text-slate-500">Qty:</label>
                <input
                  type="number"
                  min={1}
                  value={quantities[product.key] ?? 1}
                  onChange={(e) => setQuantity(product.key, parseInt(e.target.value, 10) || 1)}
                  className="w-16 border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <button
                  onClick={() => addToCart(product)}
                  className="ml-auto bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 dark:text-slate-950 dark:hover:bg-cyan-400"
                >
                  Add to Cart
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 border-l-4 border-cyan-500 bg-slate-100 p-5 dark:bg-slate-800/50">
          <h3 className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">Redeem Order</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Already have an order ID? Go to the redemption page.
          </p>
          <Link
            href={latestOrder ? `/redeem?orderId=${encodeURIComponent(latestOrder.orderId)}` : "/redeem"}
            className="mt-4 inline-flex bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 dark:text-slate-950 dark:hover:bg-cyan-400"
          >
            Go to Redeem
          </Link>
        </div>

        {latestOrder && (
          <div className="mt-6 border-l-4 border-emerald-500 bg-slate-100 p-5 dark:bg-slate-800/50">
            <p className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Latest Order</p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Order ID: <span className="font-mono text-emerald-600 dark:text-emerald-400">{latestOrder.orderId}</span>
            </p>
          </div>
        )}
      </section>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => !isCheckingOut && setIsCartOpen(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-md border-l border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your Cart ({cartItemCount})</h2>
              <button
                onClick={() => !isCheckingOut && setIsCartOpen(false)}
                className="p-2 text-slate-500 transition hover:text-cyan-600 dark:text-slate-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="mt-8 text-center">
                <p className="text-slate-500 dark:text-slate-400">Your cart is empty.</p>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="mt-4 text-sm text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <>
                <div className="mt-6 max-h-[50vh] space-y-4 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.productKey} className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
                      <img src={item.logoUrl} alt={item.productName} className="h-10 w-10 object-contain bg-white p-1" />
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900 dark:text-white">{item.productName}</h4>
                        <p className="text-xs text-slate-500">{item.priceLabel} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQuantity(item.productKey, item.quantity - 1)}
                          className="h-8 w-8 border border-slate-300 text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.productKey, item.quantity + 1)}
                          className="h-8 w-8 border border-slate-300 text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productKey)}
                        className="p-1 text-slate-400 transition hover:text-red-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Customer Info */}
                <div className="mt-6 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Customer Details</h4>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {/* Total */}
                <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Subtotal</span>
                    <span className="font-semibold text-slate-900 dark:text-white">RM {calculateCartTotal().toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Processing Fee</span>
                    <span className="font-semibold text-slate-900 dark:text-white">RM 1.00</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                    <span className="text-base font-semibold text-slate-900 dark:text-white">Total</span>
                    <span className="text-xl font-bold text-cyan-600 dark:text-cyan-400">RM {(calculateCartTotal() + 1).toFixed(2)}</span>
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  ⚠️ RM 1.00 processing fee applies per transaction. Buy more items for better value!
                </p>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={clearCart}
                    disabled={isCheckingOut}
                    className="flex-1 border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Clear
                  </button>
                  <button
                    onClick={checkout}
                    disabled={isCheckingOut}
                    className="flex-1 bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-950 dark:hover:bg-cyan-400"
                  >
                    {isCheckingOut ? "Processing..." : "Checkout"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {infoModalProduct && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
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
