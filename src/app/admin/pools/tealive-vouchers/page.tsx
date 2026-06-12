"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

type VoucherImageRow = {
  id: number;
  productKey: string;
  imageUrl?: string;
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

const ITEMS_PER_PAGE = 50;

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
  const [previewImage, setPreviewImage] = useState<VoucherImageRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const lastClickedIdx = useRef<number | null>(null);
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

  function toggleSelect(id: number, e: React.MouseEvent) {
    const currentIdx = images.findIndex((a) => a.id === id);

    if (e.shiftKey && lastClickedIdx.current !== null && lastClickedIdx.current !== currentIdx) {
      const start = Math.min(lastClickedIdx.current, currentIdx);
      const end = Math.max(lastClickedIdx.current, currentIdx);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(images[i].id);
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
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map((a) => a.id)));
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected voucher image(s)?`)) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch("/api/admin/voucher-images", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });
        if (res.ok) deleted++;
      } catch { /* ignore */ }
    }
    toast.success(`Deleted ${deleted} of ${selectedIds.size} voucher(s).`);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    await fetchImages();
  }

  async function saveStatusEdit(id: number, newStatus: string) {
    // Extra warning when re-enabling a used voucher
    const currentImg = images.find((i) => i.id === id);
    if (currentImg?.status === "used" && newStatus === "available") {
      const confirmed = confirm(
        "WARNING: This voucher was already claimed by a customer.\n\n" +
        "Re-enabling it will:\n" +
        "- Make it available for new claims\n" +
        "- Remove the association with the previous customer\n\n" +
        "Only do this if the previous claim was a mistake or refunded.\n\n" +
        "Continue?"
      );
      if (!confirmed) {
        setEditingId(null);
        return;
      }
    }

    try {
      const res = await fetch("/api/admin/voucher-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus })
      });
      if (res.ok) {
        toast.success(`Status changed to ${newStatus}.`);
        await fetchImages();
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to update.");
      }
    } catch {
      toast.error("Failed to update.");
    }
    setEditingId(null);
  }

  async function fetchPreview(img: VoucherImageRow) {
    // If we already have the imageUrl cached, just show it
    if (img.imageUrl) {
      setPreviewImage(img);
      return;
    }
    try {
      const res = await fetch(`/api/admin/voucher-images?id=${img.id}`);
      const data = await res.json();
      if (res.ok && data.image) {
        const full = { ...img, imageUrl: data.image.imageUrl };
        setPreviewImage(full);
      } else {
        toast.error("Failed to load preview.");
      }
    } catch {
      toast.error("Failed to load preview.");
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
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{stats.available + stats.used + stats.disabled}</p>
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

      {/* Filter & Actions */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
            disabled={loading}
            className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
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

      {/* Voucher List */}
      <div className="mt-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading...</p>
        ) : images.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No voucher images in the pool yet.</p>
        ) : (
          <div className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={images.length > 0 && selectedIds.size === images.length}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 cursor-pointer accent-red-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">#</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Product</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Assigned To</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Created</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((img) => (
                    <tr key={img.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(img.id)}
                          onClick={(e) => toggleSelect(img.id, e)}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 cursor-pointer accent-red-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{img.id}</td>
                      <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400">
                        {PRODUCT_OPTIONS.find((o) => o.key === img.productKey)?.label ?? img.productKey}
                      </td>
                      <td className="px-4 py-2">
                        {editingId === img.id ? (
                          <select
                            value={editStatus}
                            onChange={(e) => {
                              setEditStatus(e.target.value);
                              saveStatusEdit(img.id, e.target.value);
                            }}
                            onBlur={() => setEditingId(null)}
                            className="border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                            autoFocus
                          >
                            <option value="available">available</option>
                            <option value="used">used</option>
                            <option value="disabled">disabled</option>
                          </select>
                        ) : (
                          <span
                            onClick={() => { setEditingId(img.id); setEditStatus(img.status); }}
                            className={`inline-block cursor-pointer px-1.5 py-0.5 text-xs hover:opacity-80 ${
                              img.status === "available"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : img.status === "used"
                                ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                : "bg-red-500/10 text-red-600 dark:text-red-400"
                            }`}>{img.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {img.claim ? img.claim.orderId : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(img.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => fetchPreview(img)}
                            className="text-xs text-cyan-500 hover:text-cyan-400"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => deleteImage(img.id)}
                            className="text-xs text-red-500 hover:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} · showing {Math.min(page * ITEMS_PER_PAGE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchImages(1)}
                disabled={page === 1 || loading}
                className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
              >«</button>
              <button
                onClick={() => fetchImages(page - 1)}
                disabled={page === 1 || loading}
                className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
              >‹ Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let start = Math.max(1, page - 2);
                if (start + 4 > totalPages) start = Math.max(1, totalPages - 4);
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => fetchImages(p)}
                    disabled={loading}
                    className={`px-2.5 py-1 text-xs ${
                      p === page
                        ? "bg-cyan-500 font-semibold text-white"
                        : "text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => fetchImages(page + 1)}
                disabled={page === totalPages || loading}
                className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
              >Next ›</button>
              <button
                onClick={() => fetchImages(totalPages)}
                disabled={page === totalPages || loading}
                className="px-2 py-1 text-xs text-slate-500 disabled:opacity-30 hover:text-cyan-600 dark:hover:text-cyan-400"
              >»</button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-lg border-2 border-slate-500 bg-white p-2 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <img
              src={previewImage.imageUrl}
              alt={`Voucher #${previewImage.id}`}
              className="h-auto w-full rounded object-contain"
            />
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs text-slate-500">#{previewImage.id} · {PRODUCT_OPTIONS.find((o) => o.key === previewImage.productKey)?.label ?? previewImage.productKey}</span>
              <span className={`text-xs font-medium uppercase ${
                previewImage.status === "available" ? "text-emerald-600" : previewImage.status === "used" ? "text-amber-600" : "text-red-600"
              }`}>{previewImage.status}</span>
            </div>
          </div>
        </div>
      )}
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
