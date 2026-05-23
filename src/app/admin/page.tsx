"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((d) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        toast.error("Invalid credentials.");
        return;
      }
      setAuthed(true);
      toast.success("Logged in.");
    } catch {
      toast.error("Login failed.");
    } finally {
      setLoggingIn(false);
    }
  }

  if (authed === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">nishinae store</p>
            <ThemeToggle />
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Admin</h1>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-cyan-500 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60 dark:text-slate-950 dark:hover:bg-cyan-400"
            >
              {loggingIn ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return <AdminDashboard onLogout={() => setAuthed(false)} />;
}

/* ───── Dashboard ───── */

type OrderItem = {
  id: number;
  productKey: string;
  productName: string;
  quantity: number;
};

type OrderRow = {
  id: number;
  orderId: string;
  productKey: string;
  productName: string;
  serviceCode: string;
  quantity: number;
  status: string;
  isCartOrder: boolean;
  createdAt: string;
  _count: { claims: number };
  items: OrderItem[];
};

type Stats = {
  total: number;
  active: number;
  depleted: number;
  totalQuantity: number;
};

type ProductPrice = {
  key: string;
  name: string;
  serviceCode: string;
  priceLabel: string;
  heroSmsCost: number | null;
  availableCount: number | null;
};

type CartItem = {
  productKey: string;
  productName: string;
  quantity: number;
};

type ProductContent = {
  key: string;
  name: string;
  redemptionInstructions: string;
  tutorialSteps: string[];
  tutorialVideoUrl: string | null;
  hasCustomInstructions: boolean;
  hasCustomSteps: boolean;
};

function sanitizeVideoUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      if (u.pathname.startsWith("/embed/")) {
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
  } catch { /* not a valid URL */ }
  return url;
}

const PRODUCT_OPTIONS = [
  { key: "cbtl", name: "Coffee Bean & Tea Leaf" },
  { key: "kfc", name: "KFC" },
  { key: "zus", name: "ZUS Coffee" },
  { key: "chagee", name: "Chagee" },
  { key: "tealive", name: "Tealive" },
  { key: "gigi", name: "Gigi Coffee" },
  { key: "luckin", name: "Luckin Coffee" },
  { key: "winrar", name: "WinRAR" },
];

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Add Order with cart
  const [newProductKey, setNewProductKey] = useState("cbtl");
  const [newQuantity, setNewQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addingOrder, setAddingOrder] = useState(false);

  const [productPrices, setProductPrices] = useState<ProductPrice[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);

  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editPriceLabel, setEditPriceLabel] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Product Content editing
  const [productContents, setProductContents] = useState<ProductContent[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [editInstructions, setEditInstructions] = useState("");
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState("");
  const [editQuantity, setEditQuantity] = useState(1);
  const [savingOrder, setSavingOrder] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const ORDERS_PER_PAGE = 10;

  // Collapsible sections state (minimized by default)
  const [showProductPrices, setShowProductPrices] = useState(false);
  const [showProductContent, setShowProductContent] = useState(false);

  async function fetchBalance() {
    setBalanceLoading(true);
    try {
      const res = await fetch("/api/admin/balance");
      const data = await res.json();
      if (res.ok) setBalance(data.balance);
      else toast.error(data.message ?? "Failed to fetch balance.");
    } catch {
      toast.error("Failed to fetch balance.");
    } finally {
      setBalanceLoading(false);
    }
  }

  async function fetchPrices() {
    setPricesLoading(true);
    try {
      const res = await fetch("/api/admin/prices");
      const data = await res.json();
      if (res.ok) setProductPrices(data.productPrices);
      else toast.error(data.message ?? "Failed to fetch prices.");
    } catch {
      toast.error("Failed to fetch prices.");
    } finally {
      setPricesLoading(false);
    }
  }

  function startPriceEdit(p: ProductPrice) {
    setEditingPrice(p.key);
    const numeric = p.priceLabel.replace(/[^0-9.]/g, "");
    setEditPriceLabel(numeric);
  }

  function cancelPriceEdit() {
    setEditingPrice(null);
  }

  async function savePriceEdit(productKey: string) {
    setSavingPrice(true);
    try {
      const res = await fetch("/api/admin/prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, priceLabel: `RM ${parseFloat(editPriceLabel || "0").toFixed(2)}` })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setEditingPrice(null);
        fetchPrices();
      } else {
        toast.error(data.message ?? "Update failed.");
      }
    } catch {
      toast.error("Update failed.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function fetchProductContents() {
    setContentLoading(true);
    try {
      const res = await fetch("/api/admin/product-content");
      const data = await res.json();
      if (res.ok) setProductContents(data.products);
      else toast.error(data.message ?? "Failed to fetch product content.");
    } catch {
      toast.error("Failed to fetch product content.");
    } finally {
      setContentLoading(false);
    }
  }

  function startContentEdit(p: ProductContent) {
    setEditingContent(p.key);
    setEditInstructions(p.redemptionInstructions);
    setEditSteps(p.tutorialSteps.length ? [...p.tutorialSteps] : [""]);
    setEditVideoUrl(p.tutorialVideoUrl ?? "");
  }

  function cancelContentEdit() {
    setEditingContent(null);
  }

  async function saveContentEdit(productKey: string) {
    setSavingContent(true);
    try {
      const res = await fetch("/api/admin/product-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKey,
          redemptionInstructions: editInstructions,
          tutorialSteps: editSteps.filter((s) => s.trim()),
          tutorialVideoUrl: editVideoUrl
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setEditingContent(null);
        fetchProductContents();
      } else {
        toast.error(data.message ?? "Save failed.");
      }
    } catch {
      toast.error("Save failed.");
    } finally {
      setSavingContent(false);
    }
  }

  async function fetchOrders() {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders);
        setStats(data.stats);
        setOrdersPage(1);
      }
    } catch {
      toast.error("Failed to fetch orders.");
    } finally {
      setOrdersLoading(false);
    }
  }

  function addToCart() {
    const product = PRODUCT_OPTIONS.find((p) => p.key === newProductKey);
    if (!product) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productKey === newProductKey);
      if (existing) {
        return prev.map((item) =>
          item.productKey === newProductKey
            ? { ...item, quantity: item.quantity + newQuantity }
            : item
        );
      }
      return [...prev, { productKey: newProductKey, productName: product.name, quantity: newQuantity }];
    });
    toast.success(`Added ${newQuantity}x ${product.name} to cart`);
  }

  function removeFromCart(productKey: string) {
    setCart((prev) => prev.filter((item) => item.productKey !== productKey));
  }

  function updateCartQuantity(productKey: string, delta: number) {
    setCart((prev) =>
      prev.map((item) =>
        item.productKey === productKey
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  }

  async function addOrder() {
    if (cart.length === 0) {
      toast.error("Cart is empty. Add at least one product.");
      return;
    }

    setAddingOrder(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((item) => ({
            productKey: item.productKey,
            quantity: item.quantity
          }))
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Order ${data.order.orderId} created with ${cart.length} product(s).`);
        setCart([]);
        fetchOrders();
      } else {
        toast.error(data.message ?? "Failed to create order.");
      }
    } catch {
      toast.error("Failed to create order.");
    } finally {
      setAddingOrder(false);
    }
  }

  function startEdit(order: OrderRow) {
    setEditingOrder(order.orderId);
    setEditOrderId(order.orderId);
    setEditQuantity(order.quantity);
  }

  function cancelEdit() {
    setEditingOrder(null);
  }

  async function saveEdit(originalOrderId: string) {
    setSavingOrder(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: originalOrderId,
          newOrderId: editOrderId,
          newQuantity: editQuantity
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setEditingOrder(null);
        fetchOrders();
      } else {
        toast.error(data.message ?? "Update failed.");
      }
    } catch {
      toast.error("Update failed.");
    } finally {
      setSavingOrder(false);
    }
  }

  async function deleteOrder(orderId: string) {
    if (!confirm(`Delete order ${orderId} and all its claims?`)) return;
    try {
      const res = await fetch("/api/admin/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchOrders();
      } else {
        toast.error(data.message ?? "Delete failed.");
      }
    } catch {
      toast.error("Delete failed.");
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    onLogout();
  }

  useEffect(() => {
    fetchBalance();
    fetchOrders();
    fetchPrices();
    fetchProductContents();
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">Admin Panel</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">HeroSMS Balance</p>
          <p className="mt-1 text-xl font-bold text-cyan-600 dark:text-cyan-400">
            ${balanceLoading ? "..." : balance ?? "—"}
          </p>
          <button
            onClick={fetchBalance}
            disabled={balanceLoading}
            className="mt-2 text-xs text-cyan-600 hover:underline dark:text-cyan-400"
          >
            Refresh
          </button>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Orders</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{stats?.total ?? "—"}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats?.active ?? "—"}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Remaining Quantity</p>
          <p className="mt-1 text-xl font-bold text-violet-600 dark:text-violet-400">{stats?.totalQuantity ?? "—"}</p>
        </div>
      </div>

      {/* Product Prices - Collapsible */}
      <div className="mt-6 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setShowProductPrices(!showProductPrices)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">HeroSMS Product Prices</h2>
            <span className="text-xs text-slate-400">{showProductPrices ? "▼" : "▶"}</span>
          </div>
          {showProductPrices && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchPrices(); }}
              disabled={pricesLoading}
              className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Refresh
            </button>
          )}
        </button>
        {showProductPrices && <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Product</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Service Code</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Price</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Cost</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Available Numbers</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {pricesLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading...</td>
                </tr>
              ) : productPrices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No price data available.</td>
                </tr>
              ) : (
                productPrices.map((p) => (
                  <tr key={p.key} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.serviceCode}</td>
                    <td className="px-4 py-2">
                      {editingPrice === p.key ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">RM</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editPriceLabel}
                            onChange={(e) => setEditPriceLabel(e.target.value)}
                            className="w-20 border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-violet-600 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-violet-400"
                          />
                        </div>
                      ) : (
                        <span className="font-semibold text-violet-600 dark:text-violet-400">{p.priceLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-semibold text-cyan-600 dark:text-cyan-400">
                      ${p.heroSmsCost !== null ? `${p.heroSmsCost}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium ${
                          p.availableCount !== null && p.availableCount > 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {p.availableCount !== null ? p.availableCount : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {editingPrice === p.key ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => savePriceEdit(p.key)}
                            disabled={savingPrice}
                            className="text-xs font-medium text-emerald-600 transition hover:text-emerald-500 disabled:opacity-50 dark:text-emerald-400"
                          >
                            {savingPrice ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelPriceEdit}
                            className="text-xs text-slate-500 transition hover:text-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startPriceEdit(p)}
                          className="text-xs text-cyan-600 transition hover:text-cyan-500 dark:text-cyan-400"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>}
      </div>

      {/* Product Content - Collapsible */}
      <div className="mt-6 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setShowProductContent(!showProductContent)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Product Content</h2>
            <span className="text-xs text-slate-400">{showProductContent ? "▼" : "▶"}</span>
          </div>
          {showProductContent && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchProductContents(); }}
              disabled={contentLoading}
              className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Refresh
            </button>
          )}
        </button>
        {showProductContent && (contentLoading ? (
          <p className="px-4 pb-4 text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {productContents.map((p) => (
              <div key={p.key} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                    {p.hasCustomInstructions && (
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-600 dark:text-violet-400">custom instructions</span>
                    )}
                    {p.hasCustomSteps && (
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-600 dark:text-cyan-400">custom steps</span>
                    )}
                    {p.tutorialVideoUrl && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">video set</span>
                    )}
                  </div>
                  {editingContent !== p.key && (
                    <button onClick={() => startContentEdit(p)} className="text-xs text-cyan-600 hover:underline dark:text-cyan-400">
                      Edit
                    </button>
                  )}
                </div>

                {editingContent === p.key && (
                  <div className="mt-4 space-y-4">
                    {/* Redemption Instructions */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Redemption Instructions (ⓘ button text)
                      </label>
                      <textarea
                        value={editInstructions}
                        onChange={(e) => setEditInstructions(e.target.value)}
                        rows={10}
                        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    {/* Tutorial Steps */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Tutorial Step-by-Step Guide
                      </label>
                      <div className="mt-2 space-y-2">
                        {editSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center bg-violet-500 text-xs font-bold text-white">
                              {i + 1}
                            </span>
                            <input
                              value={step}
                              onChange={(e) => {
                                const updated = [...editSteps];
                                updated[i] = e.target.value;
                                setEditSteps(updated);
                              }}
                              className="flex-1 border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              placeholder={`Step ${i + 1}`}
                            />
                            <button
                              onClick={() => setEditSteps(editSteps.filter((_, idx) => idx !== i))}
                              className="mt-1.5 p-1 text-red-400 hover:text-red-600"
                              title="Remove step"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setEditSteps([...editSteps, ""])}
                          className="mt-1 text-xs text-cyan-600 hover:underline dark:text-cyan-400"
                        >
                          + Add Step
                        </button>
                      </div>
                    </div>

                    {/* YouTube Video URL */}
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        YouTube Embed URL
                      </label>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Paste any YouTube link — watch, share, or embed URL. Auto-converted to privacy-enhanced embed.
                      </p>
                      <input
                        value={editVideoUrl}
                        onChange={(e) => setEditVideoUrl(e.target.value)}
                        placeholder="Paste any YouTube link: youtube.com/watch?v=... or youtu.be/..."
                        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      />
                      {editVideoUrl && (
                        <div className="mt-2 aspect-video w-full max-w-sm overflow-hidden border border-slate-200 bg-black dark:border-slate-700">
                          <iframe src={sanitizeVideoUrl(editVideoUrl)} className="h-full w-full" allowFullScreen title="preview" />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => saveContentEdit(p.key)}
                        disabled={savingContent}
                        className="bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60 dark:text-slate-950"
                      >
                        {savingContent ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        onClick={cancelContentEdit}
                        className="border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Add Order */}
      <div className="mt-6 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add Order</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="text-xs text-slate-500">Product</label>
            <select
              value={newProductKey}
              onChange={(e) => setNewProductKey(e.target.value)}
              className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {PRODUCT_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Quantity</label>
            <input
              type="number"
              min={1}
              value={newQuantity}
              onChange={(e) => setNewQuantity(parseInt(e.target.value, 10) || 1)}
              className="mt-1 block w-24 border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <button
            onClick={addToCart}
            className="border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-600 transition hover:bg-cyan-50 dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-950"
          >
            Add to Cart
          </button>
          <button
            onClick={addOrder}
            disabled={addingOrder || cart.length === 0}
            className="bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60 dark:text-slate-950 dark:hover:bg-cyan-400"
          >
            {addingOrder ? "Creating..." : `Create Order (${cart.length} items)`}
          </button>
        </div>

        {/* Cart Display */}
        {cart.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="text-xs text-slate-500">Cart Items:</p>
            <div className="mt-2 space-y-2">
              {cart.map((item) => (
                <div key={item.productKey} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{item.productName}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateCartQuantity(item.productKey, -1)}
                      className="h-6 w-6 border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.productKey, 1)}
                      className="h-6 w-6 border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400"
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeFromCart(item.productKey)}
                      className="ml-2 p-1 text-red-500 hover:text-red-600"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="mt-6 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between p-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Orders</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {orderSearch.trim()
                ? `${orders.filter((o) => o.orderId.toLowerCase().includes(orderSearch.toLowerCase().trim())).length} of ${orders.length} total`
                : `${orders.length} total`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setOrdersPage(1);
                }}
                placeholder="Search order ID..."
                className="w-48 border border-slate-300 bg-white pr-7 pl-3 py-1.5 text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
              {orderSearch && (
                <button
                  onClick={() => {
                    setOrderSearch("");
                    setOrdersPage(1);
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  aria-label="Clear search"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              )}
            </div>
            <button
              onClick={fetchOrders}
              disabled={ordersLoading}
              className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Order ID</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Products</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Total Qty</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Claims</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Created</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">No orders found.</td>
                </tr>
              ) : (
                (orderSearch.trim()
                  ? orders.filter((o) => o.orderId.toLowerCase().includes(orderSearch.toLowerCase().trim()))
                  : orders
                ).slice((ordersPage - 1) * ORDERS_PER_PAGE, ordersPage * ORDERS_PER_PAGE).map((order) => (
                  <tr key={order.orderId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">
                      {editingOrder === order.orderId ? (
                        <input
                          value={editOrderId}
                          onChange={(e) => setEditOrderId(e.target.value)}
                          className="w-full border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      ) : (
                        <span className="font-mono text-xs text-slate-900 dark:text-white">{order.orderId}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {order.isCartOrder && order.items && order.items.length > 0 ? (
                        <div className="space-y-0.5">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="text-sm text-slate-700 dark:text-slate-300">
                              {item.productName} x{item.quantity}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300">{order.productName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editingOrder === order.orderId ? (
                        <input
                          type="number"
                          min={0}
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(parseInt(e.target.value, 10) || 0)}
                          className="w-20 border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      ) : (
                        <span className="text-cyan-600 dark:text-cyan-400">{order.quantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-medium ${
                          order.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{order._count.claims}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      {editingOrder === order.orderId ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEdit(order.orderId)}
                            disabled={savingOrder}
                            className="text-xs font-medium text-emerald-600 transition hover:text-emerald-500 disabled:opacity-50 dark:text-emerald-400"
                          >
                            {savingOrder ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs text-slate-500 transition hover:text-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(order)}
                            className="text-xs text-cyan-600 transition hover:text-cyan-500 dark:text-cyan-400"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteOrder(order.orderId)}
                            className="text-xs text-red-500 transition hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {(() => {
          const filteredOrders = orderSearch.trim()
            ? orders.filter((o) => o.orderId.toLowerCase().includes(orderSearch.toLowerCase().trim()))
            : orders;
          const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
          if (filteredOrders.length <= ORDERS_PER_PAGE) return null;
          return (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                Page {ordersPage} of {totalPages} · showing {Math.min(ordersPage * ORDERS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOrdersPage(1)}
                  disabled={ordersPage === 1}
                  className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
                >«</button>
                <button
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  disabled={ordersPage === 1}
                  className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
                >‹ Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let start = Math.max(1, ordersPage - 2);
                  if (start + 4 > totalPages) start = Math.max(1, totalPages - 4);
                  const page = start + i;
                  if (page > totalPages) return null;
                  return (
                    <button
                      key={page}
                      onClick={() => setOrdersPage(page)}
                      className={`px-2.5 py-1 text-xs ${
                        page === ordersPage
                          ? "bg-cyan-500 font-semibold text-white"
                          : "text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setOrdersPage((p) => Math.min(totalPages, p + 1))}
                  disabled={ordersPage === totalPages}
                  className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
                >Next ›</button>
                <button
                  onClick={() => setOrdersPage(totalPages)}
                  disabled={ordersPage === totalPages}
                  className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
                >»</button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Account Pools Link */}
      <div className="mt-6 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account Pools</h2>
            <p className="mt-0.5 text-xs text-slate-400">Manage CBTL Email Pool and Luckin Coffee Account Pool</p>
          </div>
          <a
            href="/admin/pools"
            className="bg-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600 dark:text-slate-950 dark:hover:bg-cyan-400"
          >
            Manage Pools
          </a>
        </div>
      </div>
    </main>
  );
}
