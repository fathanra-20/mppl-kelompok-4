"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Package,
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Filter,
  Layers,
  ArrowUpDown,
  Calendar,
  Sparkles,
  Info,
} from "lucide-react";
import { getProducts } from "@/lib/db";
import type { Product, ProductBatch } from "@/lib/types";
import { formatRupiah, formatStockHierarchy, getExpiryStatus } from "@/lib/utils";

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CRITICAL" | "WARNING" | "SAFE" | "LOW_STOCK">("ALL");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getProducts();
        setProducts(data);
      } catch (err) {
        console.error("Failed to load inventory", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Compute Inventory-wide FEFO Statistics
  const stats = useMemo(() => {
    let totalBaseUnits = 0;
    let criticalBatches = 0;
    let warningBatches = 0;
    let lowStockProducts = 0;

    for (const p of products) {
      totalBaseUnits += p.total_stock_base;
      if (p.total_stock_base <= p.min_stock_alert) {
        lowStockProducts += 1;
      }
      for (const b of p.batches) {
        if (b.stock_base_unit <= 0) continue;
        const { status } = getExpiryStatus(b.expiry_date);
        if (status === "CRITICAL" || status === "EXPIRED") criticalBatches += 1;
        if (status === "WARNING") warningBatches += 1;
      }
    }

    return {
      totalProducts: products.length,
      totalBaseUnits,
      criticalBatches,
      warningBatches,
      lowStockProducts,
    };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.batches.some((b) => b.batch_number.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (statusFilter === "ALL") return true;
      if (statusFilter === "LOW_STOCK") return p.total_stock_base <= p.min_stock_alert;

      // Filter by batch status
      const hasStatus = p.batches.some((b) => {
        if (b.stock_base_unit <= 0) return false;
        const exp = getExpiryStatus(b.expiry_date);
        return exp.status === statusFilter;
      });

      return hasStatus;
    });
  }, [products, searchQuery, statusFilter]);

  return (
    <div className="min-h-[calc(100vh-4rem)] p-6 space-y-6 bg-background">
      {/* Header & Quick Intro */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" />
            Dashboard Inventaris & Manajemen FEFO
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitoring stok multi-satuan dan visualisasi prioritas First Expired, First Out.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border px-3 py-1.5 rounded-lg">
          <Info className="h-3.5 w-3.5 text-emerald-600" />
          <span>Alokasi otomatis FEFO mengunci batch terawal secara deterministik.</span>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total Obat (SKU)</span>
            <Package className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-foreground">{stats.totalProducts}</p>
          <p className="text-[11px] text-muted-foreground">
            {stats.totalBaseUnits.toLocaleString("id-ID")} total unit dasar
          </p>
        </div>

        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">Batch Kritis (&lt; 30 Hari)</span>
            <AlertOctagon className="h-4 w-4 text-rose-600" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-rose-600">{stats.criticalBatches}</p>
          <p className="text-[11px] text-rose-600/80 font-medium">Prioritas FEFO Utama untuk dikeluarkan</p>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Peringatan (&lt; 90 Hari)</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-amber-600">{stats.warningBatches}</p>
          <p className="text-[11px] text-amber-600/80 font-medium">Evaluasi retur atau diskon resep</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Stok Menipis</span>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-extrabold font-mono text-foreground">{stats.lowStockProducts}</p>
          <p className="text-[11px] text-muted-foreground">Mendekati batas buffer minimum</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama obat, nomor batch, atau SKU..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-xs focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "ALL", label: "Semua" },
            { id: "CRITICAL", label: "Kritis (< 30 Hari)" },
            { id: "WARNING", label: "Peringatan (< 90 Hari)" },
            { id: "SAFE", label: "Aman" },
            { id: "LOW_STOCK", label: "Stok Menipis" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                statusFilter === f.id
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Obat & SKU</th>
                <th className="px-4 py-3">Satuan Dasar</th>
                <th className="px-4 py-3">Total Stok</th>
                <th className="px-4 py-3">Visualisasi FEFO & Batch (Prioritas Pengurangan)</th>
                <th className="px-4 py-3">Daftar Harga Multi-Satuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Memuat data inventaris...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Tidak ada obat yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isLow = p.total_stock_base <= p.min_stock_alert;

                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      {/* Name & SKU */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-bold text-foreground text-sm">{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {p.sku}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{p.category}</span>
                        </div>
                      </td>

                      {/* Base Unit */}
                      <td className="px-4 py-3.5 align-top">
                        <span className="font-mono font-semibold text-foreground bg-muted/60 px-2 py-1 rounded">
                          {p.base_unit}
                        </span>
                      </td>

                      {/* Total Stock */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold text-sm ${
                              isLow ? "text-rose-600" : "text-foreground"
                            }`}
                          >
                            {p.total_stock_base.toLocaleString("id-ID")}
                          </span>
                          <span className="text-muted-foreground text-xs">{p.base_unit}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          ≈ {formatStockHierarchy(p.total_stock_base, p.units)}
                        </div>
                        {isLow && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 rounded">
                            Min Buffer: {p.min_stock_alert}
                          </span>
                        )}
                      </td>

                      {/* FEFO Batches Visualization */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1.5 min-w-[280px]">
                          {p.batches.map((batch, bIdx) => {
                            const exp = getExpiryStatus(batch.expiry_date);
                            const isFefoTarget = bIdx === 0 && batch.stock_base_unit > 0;

                            return (
                              <div
                                key={batch.id}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                                  isFefoTarget
                                    ? "border-emerald-500/40 bg-emerald-500/5 shadow-xs"
                                    : "border-border bg-background"
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-semibold text-[11px] text-foreground">
                                      {batch.batch_number}
                                    </span>
                                    {isFefoTarget && (
                                      <span className="text-[9px] font-extrabold uppercase px-1 py-0.2 rounded bg-emerald-600 text-white">
                                        FEFO Target #1
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    <span>Exp: {batch.expiry_date}</span>
                                  </div>
                                </div>

                                <div className="text-right space-y-0.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${exp.badgeClass}`}
                                  >
                                    {exp.label}
                                  </span>
                                  <div className="text-[11px] font-mono font-bold text-foreground">
                                    {batch.stock_base_unit} {p.base_unit}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* Multi-Unit Pricing */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1 min-w-[150px]">
                          {p.units.map((u) => (
                            <div key={u.id} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                1 {u.unit_name} ({u.conversion_factor} {p.base_unit})
                              </span>
                              <span className="font-mono font-bold text-foreground">
                                {formatRupiah(u.price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
