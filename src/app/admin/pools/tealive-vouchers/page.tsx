"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

type VoucherImageRow = {
  id: number;
  productKey: string;
  imageUrl: string;
  status: string;
  claimId: string | null;
  assignedAt: string | null;
  createdAt: string;
  claim: { claimId: string; status: string; createdAt: string; orderId: string } | null;
};

const PRODUCT_OPTIONS = [
  { key: "tealive_rm5", label: "Tealive RM5 Voucher" },
  { key: "tealive_b1f1", label: "Tealive Buy 1 Free 1 Voucher" }
];

const ITEMS_PER_PAGE = 24;

export default function TealiveVouchersPoolPage() {
  const [images, setImages] = useState<VoucherImageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterKey, setFilterKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [selectedProductKey, setSelectedProductKey] = useState("tealive_rm5");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ available: 0, used: 0, disabled: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchImages(currentPage = page) {
    setLoading(true);
    try {
      let url = `/api/admin/voucher-images?page=${currentPage}&limit=${ITEMS_PER_PAGE}`;
      if (filterKey) url += `&productKey=${filterKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setImages(data.images);
        setTotalPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
        setPage(data.page ?? 1);
        setStats(data.stats ?? { available: 0, used: 0, disabled: 0 });
      } else toast.error(data.message ?? "Failed to fetch voucher images.");
    } catch {
      toast.error("Failed to fetch voucher images.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const bulkImages: { productKey: string; imageUrl: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

      const dataUrl = await fileToDataUrl(file);
      bulkImages.push({ productKey: selectedProductKey, imageUrl: dataUrl });
    }

    if (bulkImages.length === 0) {
      toast.error("No valid image files selected.");
      setUploading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/voucher-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: bulkImages })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Uploaded ${data.created} voucher image(s).`);
        await fetchImages();
      } else {
        toast.error(data.message ?? "Upload failed.");
      }
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteImage(id: number) {
    if (!confirm("Delete this voucher image?")) return;
    try {
      const res = await fetch("/api/admin/voucher-images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        toast.success("Deleted.");
        await fetchImages();
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to delete.");
      }
    } catch {
      toast.error("Failed to delete.");
    }
  }

  async function toggleStatus(id: number, currentStatus: string) {
    const newStatus = currentStatus === "available" ? "disabled" : "available";

    // Extra warning when re-enabling a used voucher
    if (currentStatus === "used") {
      const confirmed = confirm(
        "WARNING: This voucher was already claimed by a customer.\n\n" +
        "Re-enabling it will:\n" +
        "- Make it available for new claims\n" +
        "- Remove the association with the previous customer\n\n" +
        "Only do this if the previous claim was a mistake or refunded.\n\n" +
        "Continue?"
      );
      if (!confirmed) return;
    }

    try {
      const res = await fetch("/api/admin/voucher-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus })
      });
      if (res.ok) {
        toast.success(currentStatus === "used" ? "Voucher re-enabled and returned to pool." : `Status changed to ${newStatus}.`);
        await fetchImages();
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to update.");
      }
    } catch {
      toast.error("Failed to update.");
    }
  }

  useEffect(() => {
    setPage(1);
    fetchImages(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);


  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-600 dark:text-violet-400">nishinae store</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tealive Voucher Image Pool</h1>
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
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.available}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Used</p>
          <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">{stats.used}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Disabled</p>
          <p className="mt-1 text-xl font-bold text-red-600 dark:text-red-400">{stats.disabled}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{images.length}</p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mt-6 border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Upload Voucher Images</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload screenshot(s) of Tealive vouchers. Each image = 1 voucher in the pool.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Product Type</label>
            <select
              value={selectedProductKey}
              onChange={(e) => setSelectedProductKey(e.target.value)}
              className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {PRODUCT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Image File(s)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100 dark:text-slate-400 dark:file:border-slate-600 dark:file:bg-slate-800 dark:file:text-slate-300"
            />
          </div>
          {uploading && <p className="text-sm text-amber-600 dark:text-amber-400">Uploading...</p>}
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6 flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Filter:</label>
        <select
          value={filterKey}
          onChange={(e) => setFilterKey(e.target.value)}
          className="border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All</option>
          {PRODUCT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={() => fetchImages(1)}
          className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {/* Images Grid */}
      <div className="mt-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading...</p>
        ) : images.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No voucher images in the pool yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <div
                key={img.id}
                className={`border p-3 ${
                  img.status === "available"
                    ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                    : img.status === "used"
                      ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                      : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                }`}
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={img.imageUrl}
                    alt={`Voucher #${img.id}`}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium uppercase ${
                      img.status === "available" ? "text-emerald-600" : img.status === "used" ? "text-amber-600" : "text-red-600"
                    }`}>
                      {img.status}
                    </span>
                    <span className="text-xs text-slate-400">#{img.id}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {PRODUCT_OPTIONS.find((o) => o.key === img.productKey)?.label ?? img.productKey}
                  </p>
                  {img.claim && (
                    <p className="mt-1 text-xs text-slate-400">
                      Assigned to: {img.claim.orderId}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => toggleStatus(img.id, img.status)}
                      className={`text-xs underline ${
                        img.status === "used"
                          ? "text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                          : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {img.status === "available" ? "Disable" : img.status === "used" ? "Re-enable" : "Enable"}
                    </button>
                    {img.status !== "used" && (
                      <button
                        onClick={() => deleteImage(img.id)}
                        className="text-xs text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="text-xs text-slate-500">
              Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, total)} of {total} images
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchImages(page - 1)}
                disabled={page <= 1 || loading}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => fetchImages(page + 1)}
                disabled={page >= totalPages || loading}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
